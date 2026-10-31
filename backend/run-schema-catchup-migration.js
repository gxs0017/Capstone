// Catch-up migration: brings the live DB (set up long ago from an older
// version of the schema) up to parity with the current database/TableSchema.sql.
// Fully additive — only adds columns/tables or widens a type/enum to allow
// more values. Nothing existing is dropped, narrowed, or renamed, and no
// existing row's data is lost. Idempotent: safe to run more than once.
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

async function addColumnIfMissing(table, column, clause) {
    if (await columnExists(table, column)) {
        console.log(`  Column ${table}.${column} already present, skipping.`);
        return;
    }
    process.stdout.write(`  Adding ${table}.${column} ... `);
    await pool.query(`ALTER TABLE ${table} ${clause}`);
    console.log('OK');
}

async function addIndexIfMissing(table, indexName, clause) {
    if (await indexExists(table, indexName)) {
        console.log(`  Index ${table}.${indexName} already present, skipping.`);
        return;
    }
    process.stdout.write(`  Adding index ${table}.${indexName} ... `);
    await pool.query(`ALTER TABLE ${table} ${clause}`);
    console.log('OK');
}

async function addFkIfMissing(name, clause) {
    if (await fkExists(name)) {
        console.log(`  FK ${name} already present, skipping.`);
        return;
    }
    process.stdout.write(`  Adding FK ${name} ... `);
    await pool.query(clause);
    console.log('OK');
}

async function run(label, sql) {
    process.stdout.write(label + ' ... ');
    await pool.query(sql);
    console.log('OK');
}

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    console.log('\n[users]');
    await addColumnIfMissing('users', 'deleted_at', "ADD COLUMN deleted_at DATETIME DEFAULT NULL");

    console.log('\n[services]');
    await addColumnIfMissing('services', 'base_price',
        "ADD COLUMN base_price DECIMAL(8,2) NOT NULL DEFAULT 25.00");

    console.log('\n[bookings] adding missing columns');
    await addColumnIfMissing('bookings', 'booking_type',
        "ADD COLUMN booking_type ENUM('ONE_TIME','RECURRING') NOT NULL DEFAULT 'ONE_TIME' AFTER notes");
    await addColumnIfMissing('bookings', 'batch_id',
        "ADD COLUMN batch_id CHAR(36) DEFAULT NULL AFTER booking_type");
    await addColumnIfMissing('bookings', 'session_number',
        "ADD COLUMN session_number TINYINT NOT NULL DEFAULT 1 AFTER batch_id");
    await addColumnIfMissing('bookings', 'sessions_in_batch',
        "ADD COLUMN sessions_in_batch TINYINT NOT NULL DEFAULT 1 AFTER session_number");
    await addColumnIfMissing('bookings', 'price',
        "ADD COLUMN price DECIMAL(8,2) DEFAULT NULL AFTER sessions_in_batch");
    await addColumnIfMissing('bookings', 'discount_percent',
        "ADD COLUMN discount_percent TINYINT NOT NULL DEFAULT 0 AFTER price");
    await addColumnIfMissing('bookings', 'decline_reason',
        "ADD COLUMN decline_reason VARCHAR(255) DEFAULT NULL AFTER stripe_payment_intent_id");
    await addColumnIfMissing('bookings', 'cancelled_by',
        "ADD COLUMN cancelled_by INT DEFAULT NULL AFTER decline_reason");
    await addColumnIfMissing('bookings', 'cancelled_at',
        "ADD COLUMN cancelled_at DATETIME DEFAULT NULL AFTER cancelled_by");
    await addColumnIfMissing('bookings', 'cancel_reason',
        "ADD COLUMN cancel_reason VARCHAR(255) DEFAULT NULL AFTER cancelled_at");

    console.log('\n[bookings] widening types (safe to re-run; no data loss)');
    await run('  status enum -> add DECLINED/COMPLETED/EXPIRED',
        "ALTER TABLE bookings MODIFY COLUMN status ENUM('PENDING','CONFIRMED','CANCELLED','DECLINED','COMPLETED','EXPIRED') NOT NULL DEFAULT 'PENDING'");
    await run('  payment_status enum -> add REFUNDED',
        "ALTER TABLE bookings MODIFY COLUMN payment_status ENUM('UNPAID','PAID','REFUNDED','FAILED') NOT NULL DEFAULT 'UNPAID'");
    await run('  scheduled_date DATE -> DATETIME',
        "ALTER TABLE bookings MODIFY COLUMN scheduled_date DATETIME DEFAULT NULL");

    console.log('\n[bookings] FK + indexes');
    await addFkIfMissing('fk_bookings_cancelled_by',
        "ALTER TABLE bookings ADD CONSTRAINT fk_bookings_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE");
    await addIndexIfMissing('bookings', 'idx_bookings_batch', "ADD INDEX idx_bookings_batch (batch_id)");
    await addIndexIfMissing('bookings', 'idx_bookings_provider_time', "ADD INDEX idx_bookings_provider_time (provider_detail_id, scheduled_date)");

    console.log('\n[provider_availability]');
    await run('  CREATE TABLE IF NOT EXISTS provider_availability', `
        CREATE TABLE IF NOT EXISTS provider_availability (
            availability_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id          INT NOT NULL,
            day_of_week      TINYINT NOT NULL,
            start_time       TIME NOT NULL,
            end_time         TIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT chk_availability_day CHECK (day_of_week BETWEEN 0 AND 6),
            CONSTRAINT chk_availability_time_range CHECK (start_time < end_time)
        )
    `);

    console.log('\n[reviews]');
    await run('  CREATE TABLE IF NOT EXISTS reviews', `
        CREATE TABLE IF NOT EXISTS reviews (
            review_id    INT AUTO_INCREMENT PRIMARY KEY,
            booking_id   INT NOT NULL UNIQUE,
            requester_id INT NOT NULL,
            provider_id  INT NOT NULL,
            rating       TINYINT NOT NULL,
            comment      TEXT DEFAULT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (requester_id) REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (provider_id)  REFERENCES users(user_id)       ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
        )
    `);

    console.log('\n--- Final verification ---');
    const [userCols] = await pool.query('SHOW COLUMNS FROM users');
    const [bookingCols] = await pool.query('SHOW COLUMNS FROM bookings');
    const [serviceCols] = await pool.query('SHOW COLUMNS FROM services');
    const [allTables] = await pool.query('SHOW TABLES');
    console.log('users has deleted_at:', userCols.some((c) => c.Field === 'deleted_at'));
    console.log('services has base_price:', serviceCols.some((c) => c.Field === 'base_price'));
    console.log('bookings column count:', bookingCols.length, '(expect 24)');
    console.log('all tables:', allTables.map((r) => Object.values(r)[0]).join(', '));

    await pool.end();
}

main().catch((err) => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
});
