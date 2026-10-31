// One-off runner for the chat feature's DB migration against the DB in .env.
// Idempotency is handled here in JS (checking information_schema before each
// ALTER) rather than with "IF NOT EXISTS" in the SQL, since that clause for
// ADD COLUMN/ADD INDEX isn't accepted by this server. Safe to run more than once.
const pool = require('./config/db');

async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function indexExists(table, indexName) {
    const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
    return rows.length > 0;
}

async function fkExists(constraintName) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema = DATABASE() AND constraint_name = ?`,
        [constraintName]
    );
    return rows.length > 0;
}

async function run(label, sql, params = []) {
    process.stdout.write('Running: ' + label + ' ... ');
    await pool.query(sql, params);
    console.log('OK');
}

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    await run('CREATE TABLE IF NOT EXISTS conversations', `
        CREATE TABLE IF NOT EXISTS conversations (
            conversation_id    INT AUTO_INCREMENT PRIMARY KEY,
            participant_one_id INT NOT NULL,
            participant_two_id INT NOT NULL,
            booking_id          INT DEFAULT NULL,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (participant_one_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
            FOREIGN KEY (participant_two_id) REFERENCES users(user_id)    ON DELETE CASCADE  ON UPDATE CASCADE,
            FOREIGN KEY (booking_id)         REFERENCES bookings(booking_id) ON DELETE SET NULL ON UPDATE CASCADE
        )
    `);

    await run('CREATE TABLE IF NOT EXISTS messages', `
        CREATE TABLE IF NOT EXISTS messages (
            message_id      INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id       INT NOT NULL,
            content         TEXT NOT NULL,
            ip_address      VARCHAR(64) DEFAULT NULL,
            status          ENUM('SENT','BLOCKED','APPROVED','REJECTED') NOT NULL DEFAULT 'SENT',
            flag_reason     VARCHAR(255) DEFAULT NULL,
            reviewed_by     INT DEFAULT NULL,
            reviewed_at     DATETIME DEFAULT NULL,
            is_read         BOOLEAN NOT NULL DEFAULT FALSE,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE  ON UPDATE CASCADE,
            FOREIGN KEY (sender_id)       REFERENCES users(user_id)                 ON DELETE CASCADE  ON UPDATE CASCADE,
            FOREIGN KEY (reviewed_by)     REFERENCES users(user_id)                 ON DELETE SET NULL ON UPDATE CASCADE,
            INDEX idx_messages_conversation (conversation_id, created_at),
            INDEX idx_messages_status (status)
        )
    `);

    // ── Upgrade path: these tables already existed from an earlier, simpler
    // version of this feature, so the CREATE TABLE IF NOT EXISTS calls above
    // were no-ops against them. Bring that existing shape up to date.
    const columnUpgrades = [
        ['ip_address', "ADD COLUMN ip_address VARCHAR(64) DEFAULT NULL AFTER content"],
        ['status', "ADD COLUMN status ENUM('SENT','BLOCKED','APPROVED','REJECTED') NOT NULL DEFAULT 'SENT' AFTER ip_address"],
        ['flag_reason', "ADD COLUMN flag_reason VARCHAR(255) DEFAULT NULL AFTER status"],
        ['reviewed_by', "ADD COLUMN reviewed_by INT DEFAULT NULL AFTER flag_reason"],
        ['reviewed_at', "ADD COLUMN reviewed_at DATETIME DEFAULT NULL AFTER reviewed_by"],
    ];
    for (const [column, clause] of columnUpgrades) {
        if (await columnExists('messages', column)) {
            console.log(`Column messages.${column} already present, skipping.`);
        } else {
            await run(`ALTER TABLE messages ${clause}`, `ALTER TABLE messages ${clause}`);
        }
    }

    if (await indexExists('messages', 'idx_messages_status')) {
        console.log('Index messages.idx_messages_status already present, skipping.');
    } else {
        await run('ADD INDEX idx_messages_status', 'ALTER TABLE messages ADD INDEX idx_messages_status (status)');
    }

    if (await fkExists('fk_messages_reviewed_by')) {
        console.log('FK fk_messages_reviewed_by already present, skipping.');
    } else {
        await run(
            'ADD FOREIGN KEY reviewed_by -> users',
            `ALTER TABLE messages ADD CONSTRAINT fk_messages_reviewed_by
             FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE`
        );
    }

    await run(
        'Normalize existing conversation participant order',
        `UPDATE conversations SET participant_one_id = LEAST(participant_one_id, participant_two_id),
                                   participant_two_id = GREATEST(participant_one_id, participant_two_id)`
    );

    if (await indexExists('conversations', 'uniq_participant_pair')) {
        console.log('Index conversations.uniq_participant_pair already present, skipping.');
    } else {
        await run(
            'ADD UNIQUE INDEX uniq_participant_pair',
            'ALTER TABLE conversations ADD UNIQUE INDEX uniq_participant_pair (participant_one_id, participant_two_id)'
        );
    }

    const [convCols] = await pool.query('DESCRIBE conversations');
    const [msgCols] = await pool.query('DESCRIBE messages');
    const [convRows] = await pool.query('SELECT conversation_id, participant_one_id, participant_two_id FROM conversations');

    console.log('\nFinal messages columns:', msgCols.map((c) => c.Field).join(', '));
    console.log('Final conversations columns:', convCols.map((c) => c.Field).join(', '));
    console.log('conversation rows (participant_one_id should be < participant_two_id):');
    console.log(convRows);

    await pool.end();
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
