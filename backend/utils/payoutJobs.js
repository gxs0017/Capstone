// utils/payoutJobs.js
// The money timeline, run every minute:
//   1. A confirmed booking whose session has happened — and that nobody raised an
//      issue about — is marked COMPLETED automatically.
//   2. Completed bookings release their payment to the provider's balance (same day).
//   3. Once a credited payment's 7-day hold is over, the provider is told it can
//      be withdrawn.
// Refund retries ride along (ledger.settle).

const pool = require('../config/db');
const ledger = require('./paymentLedger');
const { notifyBookings } = require('./realtime');
const { notify } = require('./notify');
const { logAction } = require('../models/AuditLog');
const { SESSION_MINUTES } = require('./bookingRules');

const SWEEP_INTERVAL_MS = 60 * 1000;

/** How long after the session ends the requester can still raise an issue before the job counts as done. */
const issueWindowMinutes = () => Math.max(0, Number(process.env.ISSUE_WINDOW_MINUTES) || 60);

const OVER_WHERE = `status = 'CONFIRMED' AND issue_reported_at IS NULL AND scheduled_date IS NOT NULL
    AND scheduled_date <= DATE_SUB(NOW(), INTERVAL ${Number(SESSION_MINUTES)} MINUTE)`;

/** Confirmed sessions that have run their course (plus the issue window) become COMPLETED. */
const autoCompleteFinished = async () => {
    const [due] = await pool.execute(
        `SELECT booking_id FROM bookings
         WHERE ${OVER_WHERE} AND scheduled_date <= DATE_SUB(NOW(), INTERVAL ${Number(SESSION_MINUTES) + issueWindowMinutes()} MINUTE)`
    );
    if (due.length === 0) return 0;
    const ids = due.map((d) => d.booking_id);
    const [result] = await pool.query(
        `UPDATE bookings SET status = 'COMPLETED', completed_at = NOW(), auto_completed = TRUE
         WHERE booking_id IN (?) AND status = 'CONFIRMED' AND issue_reported_at IS NULL`,
        [ids]
    );
    if (result.affectedRows) {
        logAction(null, 'BOOKING_AUTO_COMPLETED', `booking: ${ids.join(',')} (session passed, no issue raised)`, null);
        notifyBookings(ids, 'completed', null);
    }
    return result.affectedRows;
};

let lastCheck = new Date();

/** Tell providers when money from an earlier job has just become withdrawable. */
const announceAvailable = async () => {
    const from = lastCheck;
    const [[{ now }]] = await pool.query('SELECT NOW() AS now');
    lastCheck = now;
    const [rows] = await pool.query(
        `SELECT provider_id, SUM(provider_amount) AS total FROM payments
         WHERE status = 'RELEASED' AND payout_id IS NULL AND available_at > ? AND available_at <= ?
         GROUP BY provider_id`,
        [from, now]
    );
    rows.forEach((r) => notify(r.provider_id, {
        type: 'PAYOUT_AVAILABLE',
        title: 'Funds ready to withdraw',
        body: `$${Number(r.total).toFixed(2)} has cleared the ${ledger.holdDays()}-day hold and is ready to withdraw.`,
        link: '/wallet',
    }));
};

const runOnce = async () => {
    const completed = await autoCompleteFinished();
    await ledger.settle();
    await announceAvailable();
    return completed;
};

const startPayoutJobs = () => {
    const run = () => runOnce()
        .then((n) => { if (n) console.log(`Auto-completed ${n} finished booking(s).`); })
        .catch((err) => console.error('Payout sweep failed:', err.message));
    run();
    return setInterval(run, SWEEP_INTERVAL_MS).unref();
};

module.exports = { startPayoutJobs, autoCompleteFinished, runOnce };
