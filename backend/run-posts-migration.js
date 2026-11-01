// Community Board migration runner — additive only, safe to re-run.
const pool = require('./config/db');

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS posts (
            post_id     INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            type        ENUM('WANTED','OFFERING') NOT NULL,
            title       VARCHAR(150) NOT NULL,
            description TEXT NOT NULL,
            price       DECIMAL(8,2) DEFAULT NULL,
            city        VARCHAR(50) DEFAULT NULL,
            status      ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
            INDEX idx_posts_type_status (type, status),
            INDEX idx_posts_created (created_at)
        )
    `);
    console.log('posts table ready.');

    const [cols] = await pool.query('DESCRIBE posts');
    console.log('posts columns:', cols.map((c) => c.Field).join(', '));

    await pool.end();
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
