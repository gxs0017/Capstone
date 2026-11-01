// utils/neighbourhoods.js
// Works out which neighbourhood ("area") a user lives in, with no form field.
//
//  1. The address is turned into coordinates (services/geocode.js).
//  2. The coordinates are matched to the nearest named OpenStreetMap area
//     (neighbourhood / suburb / quarter) within MAX_KM — the `neighbourhoods`
//     rows with source 'OSM', filled by `node import-neighbourhoods.js`.
//  3. If no named area is close enough, the user falls back to their postal
//     area (first three characters, e.g. "L6X"), so nobody is left unassigned.
//
// New areas are picked up automatically: importing more `neighbourhoods` rows
// and the periodic sweep (startSweeper) re-assign every user with coordinates.
// Only the area NAME is ever shown to other people, never the street.

const pool = require('../config/db');
const { geocodeAddress } = require('../services/geocode');
const { fsaOf, haversineKm, inCanada } = require('./places');

const MAX_KM = 2.5;
const BOX_DEG = 0.06;          // ≈ 6.5 km latitude window used to pre-filter candidates
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
const GEOCODE_PER_SWEEP = 25;

const inFlight = new Set();

const nearestNamedArea = async (lat, lng) => {
    const [rows] = await pool.execute(
        `SELECT neighbourhood_id, name, lat, lng FROM neighbourhoods
         WHERE source = 'OSM' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
        [lat - BOX_DEG, lat + BOX_DEG, lng - BOX_DEG * 1.4, lng + BOX_DEG * 1.4]
    );
    let best = null;
    for (const r of rows) {
        const d = haversineKm(lat, lng, Number(r.lat), Number(r.lng));
        if (d <= MAX_KM && (!best || d < best.d)) best = { id: r.neighbourhood_id, d };
    }
    return best ? best.id : null;
};

const postalArea = async (user) => {
    const fsa = fsaOf(user.postal_code);
    if (!fsa) return null;
    const name = `${user.city} (${fsa})`;
    await pool.execute(
        `INSERT INTO neighbourhoods (name, source, ext_key, province, lat, lng)
         VALUES (?, 'POSTAL', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE neighbourhood_id = LAST_INSERT_ID(neighbourhood_id)`,
        [name, fsa, user.province, user.lat ?? null, user.lng ?? null]
    );
    const [rows] = await pool.execute("SELECT neighbourhood_id FROM neighbourhoods WHERE source = 'POSTAL' AND ext_key = ?", [fsa]);
    return rows[0] ? rows[0].neighbourhood_id : null;
};

/** Re-computes and stores one user's neighbourhood. Returns the id (or null). */
const assignUser = async (userId) => {
    const [rows] = await pool.execute(
        'SELECT user_id, city, province, postal_code, lat, lng FROM users WHERE user_id = ? AND deleted_at IS NULL', [userId]
    );
    const user = rows[0];
    if (!user) return null;
    let id = null;
    if (user.lat !== null && user.lng !== null && inCanada(Number(user.lat), Number(user.lng))) {
        id = await nearestNamedArea(Number(user.lat), Number(user.lng));
    }
    if (!id) id = await postalArea(user);
    await pool.execute('UPDATE users SET neighbourhood_id = ? WHERE user_id = ?', [id, userId]);
    return id;
};

/** Makes sure a user has coordinates (looking them up if not), then assigns the neighbourhood. */
const refreshUser = async (userId) => {
    if (inFlight.has(userId)) return null;
    inFlight.add(userId);
    try {
        const [rows] = await pool.execute(
            'SELECT street, city, province, postal_code, lat, lng FROM users WHERE user_id = ? AND deleted_at IS NULL', [userId]
        );
        const user = rows[0];
        if (!user) return null;
        if (user.lat === null || user.lng === null) {
            const found = await geocodeAddress({ street: user.street, city: user.city, province: user.province, postalCode: user.postal_code });
            if (found) await pool.execute('UPDATE users SET lat = ?, lng = ? WHERE user_id = ?', [found.lat, found.lng, userId]);
        }
        return await assignUser(userId);
    } catch (err) {
        console.error('refreshUser failed:', err.message);
        return null;
    } finally {
        inFlight.delete(userId);
    }
};

/** Fire-and-forget version for request handlers (never blocks or throws). */
const refreshUserInBackground = (userId) => { refreshUser(userId).catch(() => {}); };

/** Re-assigns everyone who has coordinates, and looks up a batch of those who don't. */
const sweepAll = async () => {
    const [located] = await pool.execute('SELECT user_id FROM users WHERE lat IS NOT NULL AND deleted_at IS NULL');
    for (const u of located) await assignUser(u.user_id);
    const [missing] = await pool.query(
        `SELECT user_id FROM users WHERE (lat IS NULL OR lng IS NULL) AND deleted_at IS NULL LIMIT ${GEOCODE_PER_SWEEP}`
    );
    for (const u of missing) await refreshUser(u.user_id);
    return { reassigned: located.length, geocoded: missing.length };
};

const startSweeper = () => {
    const run = () => sweepAll().then((r) => console.log('Neighbourhood sweep:', JSON.stringify(r))).catch((e) => console.error('Neighbourhood sweep failed:', e.message));
    setTimeout(run, 30 * 1000).unref();
    setInterval(run, SWEEP_EVERY_MS).unref();
};

module.exports = { assignUser, refreshUser, refreshUserInBackground, sweepAll, startSweeper, MAX_KM };
