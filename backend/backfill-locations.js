// Looks up coordinates for every user that doesn't have them yet (free
// OpenStreetMap geocoder, ~1 request/second) and assigns their neighbourhood.
// Safe to re-run; only touches users with missing coordinates.
//
//   node backfill-locations.js
const pool = require('./config/db');
const { refreshUser, sweepAll } = require('./utils/neighbourhoods');

async function main() {
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);
    const [missing] = await pool.query('SELECT user_id FROM users WHERE (lat IS NULL OR lng IS NULL) AND deleted_at IS NULL');
    console.log(`${missing.length} user(s) need coordinates (about ${Math.ceil(missing.length * 1.2 / 60)} min).`);
    let done = 0;
    for (const u of missing) {
        await refreshUser(u.user_id);
        if (++done % 10 === 0) console.log(`  ${done}/${missing.length}`);
    }
    const result = await sweepAll();
    console.log('Done. Re-assigned users:', JSON.stringify(result));
    const [rows] = await pool.query(
        `SELECT nb.source, COUNT(*) AS users FROM users u JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id GROUP BY nb.source`);
    console.log('Users by neighbourhood type:', JSON.stringify(rows));
    await pool.end();
}

main().catch((err) => { console.error('Backfill failed:', err.message); process.exit(1); });
