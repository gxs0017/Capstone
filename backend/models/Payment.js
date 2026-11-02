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

/**
 * A provider's money, by where it is in its journey:
 *   held       paid by the requester, job not done yet
 *   pending    credited to the provider, still inside the 7-day hold
 *   available  hold over — can be withdrawn now
 *   withdrawn  already requested for payout
 */
const balanceFor = async (providerId) => {
    const [[row]] = await pool.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'HELD' THEN provider_amount END), 0) AS held,
           COALESCE(SUM(CASE WHEN status = 'RELEASED' AND payout_id IS NULL AND available_at >  NOW() THEN provider_amount END), 0) AS pending,
           COALESCE(SUM(CASE WHEN status = 'RELEASED' AND payout_id IS NULL AND available_at <= NOW() THEN provider_amount END), 0) AS available,
           COALESCE(SUM(CASE WHEN status = 'RELEASED' AND payout_id IS NOT NULL THEN provider_amount END), 0) AS withdrawn,
           MIN(CASE WHEN status = 'RELEASED' AND payout_id IS NULL AND available_at > NOW() THEN available_at END) AS nextAvailableAt
         FROM payments WHERE provider_id = ?`,
        [providerId]
    );
    return {
        held: Number(row.held), pending: Number(row.pending),
        available: Number(row.available), withdrawn: Number(row.withdrawn),
        nextAvailableAt: row.nextAvailableAt,
    };
};

const getPayouts = async (providerId) => {
    const [rows] = await pool.execute(
        'SELECT * FROM payouts WHERE provider_id = ? ORDER BY payout_id DESC LIMIT 50', [providerId]);
    return rows;
};

/** Every payout request, for the admin to action. */
const listAllPayouts = async () => {
    const [rows] = await pool.execute(
        `SELECT po.*, CONCAT(u.first_name, ' ', u.last_name) AS provider_name, u.email AS provider_email
         FROM payouts po JOIN users u ON u.user_id = po.provider_id
         ORDER BY (po.status = 'REQUESTED') DESC, po.payout_id DESC LIMIT 100`);
    return rows;
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
        balance: await balanceFor(userId),
        payouts: await getPayouts(userId),
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

module.exports = { getForUser, getOverview, balanceFor, listAllPayouts };
