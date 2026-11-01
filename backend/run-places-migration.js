// Migration for addresses, neighbourhoods, provider contact privacy and the
// board's neighbourhood tag. Additive and idempotent — safe to run more than
// once. The only data change: old RECOMMENDATION board posts become GENERAL
// (recommendations are generated from ratings now, not posted).
//
//   cd backend && node run-places-migration.js
const pool = require('./config/db');

async function tableExists(table) {
    const [rows] = await pool.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    return rows.length > 0;
}
async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]);
    return rows.length > 0;
}
async function indexExists(table, name) {
    const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return rows.length > 0;
}
async function addColumn(table, column, clause) {
    if (await columnExists(table, column)) return console.log(`  ${table}.${column}: already present`);
    await pool.query(`ALTER TABLE ${table} ${clause}`);
    console.log(`  ${table}.${column}: added`);
}
async function addIndex(table, name, columns) {
    if (await indexExists(table, name)) return console.log(`  ${table}.${name}: already present`);
    await pool.query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
    console.log(`  ${table}.${name}: added`);
}

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    console.log('\n[neighbourhoods]');
    const existed = await tableExists('neighbourhoods');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS neighbourhoods (
            neighbourhood_id INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(120) NOT NULL,
            source     ENUM('OSM','POSTAL') NOT NULL,
            ext_key    VARCHAR(40)  NOT NULL,
            province   CHAR(2)      DEFAULT NULL,
            lat        DECIMAL(9,6) DEFAULT NULL,
            lng        DECIMAL(9,6) DEFAULT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_neighbourhood_source (source, ext_key),
            INDEX idx_neighbourhood_geo (source, lat, lng)
        )
    `);
    console.log(`  neighbourhoods: ${existed ? 'already present' : 'created'}`);

    console.log('\n[users]');
    await addColumn('users', 'lat', 'ADD COLUMN lat DECIMAL(9,6) DEFAULT NULL');
    await addColumn('users', 'lng', 'ADD COLUMN lng DECIMAL(9,6) DEFAULT NULL');
    await addColumn('users', 'neighbourhood_id', 'ADD COLUMN neighbourhood_id INT DEFAULT NULL');
    await addColumn('users', 'show_email', 'ADD COLUMN show_email BOOLEAN NOT NULL DEFAULT FALSE');
    await addColumn('users', 'show_phone', 'ADD COLUMN show_phone BOOLEAN NOT NULL DEFAULT FALSE');
    await addIndex('users', 'idx_users_neighbourhood', 'neighbourhood_id');

    console.log('\n[posts]');
    await addColumn('posts', 'neighbourhood_id', 'ADD COLUMN neighbourhood_id INT DEFAULT NULL');
    await addIndex('posts', 'idx_posts_neighbourhood', 'neighbourhood_id');
    const [res] = await pool.query("UPDATE posts SET type = 'GENERAL' WHERE type = 'RECOMMENDATION'");
    console.log(`  RECOMMENDATION posts converted to GENERAL: ${res.affectedRows}`);

    console.log('\n--- Verification ---');
    console.log('neighbourhoods exists:', await tableExists('neighbourhoods'));
    for (const c of ['lat', 'lng', 'neighbourhood_id', 'show_email', 'show_phone']) {
        console.log(`users.${c}:`, await columnExists('users', c));
    }
    console.log('posts.neighbourhood_id:', await columnExists('posts', 'neighbourhood_id'));
    await pool.end();
}

main().catch((err) => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
});
