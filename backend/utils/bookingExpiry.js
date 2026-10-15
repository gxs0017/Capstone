// utils/bookingExpiry.js
// Auto-expires PENDING requests that no provider accepted in time.
// A request expires when EITHER
//   - it has waited PENDING_EXPIRY_HOURS since it was made, OR
//   - its scheduled start time has already passed.
// Prepaid (PAID) sessions are flagged REFUNDED, same as a cancel/decline.
// Uses the DB clock (NOW()) on both sides so booking_date comparisons are consistent.

const pool = require('../config/db');
const { PENDING_EXPIRY_HOURS } = require('./bookingRules');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Expire every stale PENDING booking. Returns how many were expired. */
const expireStalePending = async () => {
    const [result] = await pool.execute(
        `UPDATE bookings
         SET status = 'EXPIRED',
             payment_status = IF(payment_status = 'PAID', 'REFUNDED', payment_status)
         WHERE status = 'PENDING'
           AND (booking_date < DATE_SUB(NOW(), INTERVAL ${Number(PENDING_EXPIRY_HOURS)} HOUR)
                OR (scheduled_date IS NOT NULL AND scheduled_date <= NOW()))`
    );
    return result.affectedRows;
};

/** Sweep now, then every few minutes. Request handlers also sweep before reading. */
const startExpiryJob = () => {
    const run = () => expireStalePending()
        .then((n) => { if (n) console.log(`Expired ${n} unaccepted booking request(s).`); })
        .catch((err) => console.error('Booking expiry sweep failed:', err.message));
    run();
    return setInterval(run, SWEEP_INTERVAL_MS).unref();
};

module.exports = { expireStalePending, startExpiryJob };
