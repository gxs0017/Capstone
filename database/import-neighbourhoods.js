// Imports named neighbourhoods (OpenStreetMap place=neighbourhood|suburb|quarter)
// into the `neighbourhoods` table, then re-assigns every user's neighbourhood.
// Re-run it whenever you want to pick up new areas — existing rows are updated,
// new ones added, and users are re-matched automatically.
//
//   node import-neighbourhoods.js                       -> Greater Toronto Area (default)
//   node import-neighbourhoods.js --bbox 43.5,-80.0,43.9,-79.5 --province ON
//
// bbox = south,west,north,east. Data © OpenStreetMap contributors (ODbL).
const pool = require('../backend/config/db');
const { sweepAll } = require('../backend/utils/neighbourhoods');

const MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];
const UA = 'NeighbourBook-capstone/1.0 (student project)';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : fallback;
};

// The default area is cut into tiles so each Overpass request stays small.
const DEFAULT_TILES = [
    [43.45, -80.15, 43.70, -79.60], [43.45, -79.60, 43.70, -79.10],
    [43.70, -80.15, 43.95, -79.60], [43.70, -79.60, 43.95, -79.10],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile([s, w, n, e]) {
    const query = `[out:json][timeout:60];nwr["place"~"^(suburb|neighbourhood|quarter)$"]["name"](${s},${w},${n},${e});out tags center;`;
    for (let attempt = 0; attempt < 6; attempt++) {
        const url = MIRRORS[attempt % MIRRORS.length];
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ data: query }),
                signal: AbortSignal.timeout(90000),
            });
            if (res.ok) return (await res.json()).elements || [];
            console.log(`  ${url} answered ${res.status}, retrying...`);
        } catch (err) {
            console.log(`  ${url} failed (${err.message}), retrying...`);
        }
        await sleep(4000 * (attempt + 1));
    }
    throw new Error('Overpass is busy right now - try again in a few minutes.');
}

async function main() {
    const province = (arg('province', 'ON')).toUpperCase();
    const bbox = arg('bbox', null);
    const tiles = bbox ? [bbox.split(',').map(Number)] : DEFAULT_TILES;
    console.log('Target DB_HOST:', process.env.DB_HOST, '| DB_NAME:', process.env.DB_NAME);

    const seen = new Map();
    for (const tile of tiles) {
        console.log(`Fetching area ${tile.join(', ')} ...`);
        for (const el of await fetchTile(tile)) {
            const lat = el.lat ?? el.center?.lat;
            const lng = el.lon ?? el.center?.lon;
            if (lat == null || lng == null || !el.tags?.name) continue;
            seen.set(`${el.type}/${el.id}`, { name: el.tags.name.slice(0, 120), lat, lng });
        }
        await sleep(2000);
    }
    console.log(`Found ${seen.size} named areas.`);

    const [[{ before }]] = await pool.query("SELECT COUNT(*) AS before FROM neighbourhoods WHERE source = 'OSM'");
    for (const [key, a] of seen) {
        await pool.query(
            `INSERT INTO neighbourhoods (name, source, ext_key, province, lat, lng)
             VALUES (?, 'OSM', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), lat = VALUES(lat), lng = VALUES(lng)`,
            [a.name, key, province, a.lat, a.lng]
        );
    }
    const [[{ after }]] = await pool.query("SELECT COUNT(*) AS after FROM neighbourhoods WHERE source = 'OSM'");
    console.log(`${after - before} new, ${seen.size - (after - before)} already present (updated).`);

    const result = await sweepAll();
    console.log('Re-assigned users:', JSON.stringify(result));
    await pool.end();
}

main().catch((err) => { console.error('\nImport failed:', err.message); process.exit(1); });
