// Migration for the neighbourhood-network upgrade: payments ledger, board
// comments + likes, richer post categories, and the directory's profile
// fields. Purely additive (new tables, new columns, one widened enum) and
// idempotent — safe to run more than once. Nothing is dropped or narrowed.
//
//   cd backend && node run-nextdoor-migration.js
const pool = require('./config/db');

async function tableExists(table) {
    const [rows] = await pool.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [table]
    );
    return rows.length > 0;
}

async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function indexExists(table, name) {
    const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return rows.length > 0;
}

async function createTable(name, sql) {
    const existed = await tableExists(name);
    await pool.query(sql);
    console.log(`  ${name}: ${existed ? 'already present' : 'created'}`);
}

async function addColumn(table, column, clause) {
    if (await columnExists(table, column)) {
        console.log(`  ${table}.${column}: already present`);
        return;
    }
    await pool.query(`ALTER TABLE ${table} ${clause}`);
    console.log(`  ${table}.${column}: added`);
}

async function addIndex(table, name, columns) {
    if (await indexExists(table, name)) {
        console.log(`  ${table}.${name}: already present`);
        return;
    }
    await pool.query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
    console.log(`  ${table}.${name}: added`);
}

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    console.log('\n[payments ledger]');
    await createTable('payments', `
        CREATE TABLE IF NOT EXISTS payments (
            payment_id      INT AUTO_INCREMENT PRIMARY KEY,
            booking_id      INT NOT NULL,
            payer_id        INT NOT NULL,
            provider_id     INT NOT NULL,
            method          VARCHAR(20)  NOT NULL,
            external_ref    VARCHAR(255) DEFAULT NULL,
            currency        CHAR(3)      NOT NULL DEFAULT 'CAD',
            amount          DECIMAL(8,2) NOT NULL,
            platform_fee    DECIMAL(8,2) NOT NULL DEFAULT 0,
            provider_amount DECIMAL(8,2) NOT NULL,
            status          ENUM('HELD','RELEASED','REFUNDED','REFUND_FAILED') NOT NULL DEFAULT 'HELD',
            refund_error    VARCHAR(255) DEFAULT NULL,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            released_at     DATETIME DEFAULT NULL,
            refunded_at     DATETIME DEFAULT NULL,
            UNIQUE KEY uniq_payment_booking (booking_id),
            FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (payer_id)    REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (provider_id) REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
            INDEX idx_payments_provider (provider_id, status),
            INDEX idx_payments_payer (payer_id)
        )
    `);

    console.log('\n[community board]');
    await pool.query(`
        ALTER TABLE posts MODIFY COLUMN type
        ENUM('GENERAL','WANTED','OFFERING','RECOMMENDATION','FOR_SALE','LOST_FOUND','SAFETY','EVENT')
        NOT NULL DEFAULT 'GENERAL'
    `);
    console.log('  posts.type: widened to the full category list');
    await addIndex('posts', 'idx_posts_city', 'city');

    await createTable('post_comments', `
        CREATE TABLE IF NOT EXISTS post_comments (
            comment_id INT AUTO_INCREMENT PRIMARY KEY,
            post_id    INT NOT NULL,
            user_id    INT NOT NULL,
            parent_id  INT DEFAULT NULL,
            content    VARCHAR(1000) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id)   REFERENCES posts(post_id)              ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (user_id)   REFERENCES users(user_id)              ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES post_comments(comment_id)   ON DELETE CASCADE ON UPDATE CASCADE,
            INDEX idx_comments_post (post_id, created_at)
        )
    `);

    await createTable('post_likes', `
        CREATE TABLE IF NOT EXISTS post_likes (
            post_id    INT NOT NULL,
            user_id    INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
        )
    `);

    console.log('\n[neighbourhood directory]');
    await addColumn('users', 'bio', 'ADD COLUMN bio VARCHAR(300) DEFAULT NULL');
    await addColumn('users', 'directory_visible', 'ADD COLUMN directory_visible BOOLEAN NOT NULL DEFAULT FALSE');
    await addIndex('users', 'idx_users_city', 'city');

    console.log('\n--- Verification ---');
    for (const t of ['payments', 'post_comments', 'post_likes']) {
        console.log(`${t} exists:`, await tableExists(t));
    }
    console.log('users.bio:', await columnExists('users', 'bio'));
    console.log('users.directory_visible:', await columnExists('users', 'directory_visible'));
    const [[typeCol]] = await pool.query("SHOW COLUMNS FROM posts LIKE 'type'");
    console.log('posts.type:', typeCol.Type);

    await pool.end();
}

main().catch((err) => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
});
