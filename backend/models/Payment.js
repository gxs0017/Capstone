// models/Payment.js
// Read queries over the `payments` ledger (written by utils/paymentLedger.js).

const pool = require('../config/db');

const ENTRY_SELECT = `
    SELECT p.*, b.scheduled_date, b.status AS booking_status, s.service_name,
           payer.first_name AS payer_first, payer.last_name AS payer_last,
           prov.first_name  AS provider_first, prov.last_name AS provider_last
    FROM payments p
    JOIN bookings b ON b.booking_id = p.booking_id
    JOIN services s ON s.service_id = b.service_id
    JOIN users payer ON payer.user_id = p.payer_id
    JOIN users prov  ON prov.user_id  = p.provider_id`;

/** Sum of `column` per ledger status, e.g. { HELD: 25, RELEASED: 80 }. */
const totalsBy = async (whereColumn, userId, column) => {
    const [rows] = await pool.execute(
        `SELECT status, SUM(${column}) AS total FROM payments WHERE ${whereColumn} = ? GROUP BY status`,
        [userId]
    );
    const totals = { HELD: 0, RELEASED: 0, REFUNDED: 0, REFUND_FAILED: 0 };
    rows.forEach((r) => { totals[r.status] = Number(r.total); });
    return totals;
};

/** Payments this user made (as requester) and earned (as provider). */
const getForUser = async (userId) => {
    const [paidEntries] = await pool.execute(
        `${ENTRY_SELECT} WHERE p.payer_id = ? ORDER BY p.created_at DESC LIMIT 100`, [userId]
    );
    const [earnedEntries] = await pool.execute(
        `${ENTRY_SELECT} WHERE p.provider_id = ? ORDER BY p.created_at DESC LIMIT 100`, [userId]
    );
    return {
        paid:   { totals: await totalsBy('payer_id', userId, 'amount'), entries: paidEntries },
        earned: { totals: await totalsBy('provider_id', userId, 'provider_amount'), entries: earnedEntries },
    };
};

/** Platform-wide view for admins. */
const getOverview = async () => {
    const [totalRows] = await pool.execute(
        `SELECT status, COUNT(*) AS n, SUM(amount) AS gross, SUM(platform_fee) AS fees FROM payments GROUP BY status`
    );
    const totals = {};
    totalRows.forEach((r) => {
        totals[r.status] = { count: Number(r.n), gross: Number(r.gross), fees: Number(r.fees) };
    });
    const [entries] = await pool.execute(`${ENTRY_SELECT} ORDER BY p.created_at DESC LIMIT 100`);
    return { totals, entries };
};

module.exports = { getForUser, getOverview };
