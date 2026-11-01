// utils/paymentLedger.js
// How money moves through the app:
//
//   1. The amount is ALWAYS computed here from the stored booking price —
//      never read from the client — so nobody can pay $1 for a $25 job.
//   2. A successful online payment marks the booking(s) PAID and writes one
//      `payments` ledger row per session with status HELD (the platform is
//      holding the money, the provider hasn't earned it yet).
//   3. When the booking is COMPLETED the row becomes RELEASED (the provider's
//      earnings). Cancel / decline / expiry sets the booking REFUNDED, and
//      settleRefunds() returns the money through the original gateway.
//
// A weekly pack is one payment covering every still-payable session; each
// session still gets its own ledger row so cancelling a single session only
// refunds that session's share.
//
// NOTE: "released" means earned/payable in the ledger. Wiring provider bank
// payouts needs Stripe Connect or PayPal Payouts onboarding on real accounts.

const pool = require('../config/db');
const { logAction } = require('../models/AuditLog');
const paypal = require('../services/paypal');
const stripeService = require('../services/stripe');

const CURRENCY = 'CAD';

class PaymentError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const toCents = (n) => Math.round(Number(n) * 100);

/** Platform cut as a percentage of each payment; 0 unless PLATFORM_FEE_PERCENT is set. */
const feePercent = () => Math.min(50, Math.max(0, Number(process.env.PLATFORM_FEE_PERCENT) || 0));

const PAYABLE_SELECT = `
    SELECT b.booking_id, b.requester_id, b.status, b.payment_status, b.booking_type, b.batch_id,
           b.session_number, b.scheduled_date,
           COALESCE(b.price, pd.price, s.base_price) AS price,
           s.service_name, pd.user_id AS provider_id,
           u.first_name AS provider_first, u.last_name AS provider_last
    FROM bookings b
    JOIN provider_details pd ON pd.provider_detail_id = b.provider_detail_id
    JOIN services s ON s.service_id = b.service_id
    JOIN users u ON u.user_id = pd.user_id`;

/**
 * What one payment for `bookingId` covers, and how much it costs.
 * One-time booking -> that booking. Weekly pack -> every session in the pack
 * that is still active and unpaid.
 * @throws {PaymentError}
 */
async function getPayableGroup(bookingId, requesterId) {
    const [rows] = await pool.execute(`${PAYABLE_SELECT} WHERE b.booking_id = ?`, [bookingId]);
    const booking = rows[0];

    if (!booking) throw new PaymentError(404, 'Booking not found.');
    if (booking.requester_id !== requesterId) throw new PaymentError(403, 'This is not your booking.');
    if (booking.payment_status === 'PAID') throw new PaymentError(400, 'This booking is already paid.', 'ALREADY_PAID');
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
        throw new PaymentError(400, `A ${booking.status.toLowerCase()} booking can't be paid.`);
    }
    if (!['UNPAID', 'FAILED'].includes(booking.payment_status)) {
        throw new PaymentError(400, 'This booking cannot be paid.');
    }

    let bookings = [booking];
    if (booking.booking_type === 'RECURRING' && booking.batch_id) {
        const [siblings] = await pool.execute(
            `${PAYABLE_SELECT}
             WHERE b.batch_id = ? AND b.requester_id = ? AND b.status IN ('PENDING','CONFIRMED')
               AND b.payment_status IN ('UNPAID','FAILED')
             ORDER BY b.session_number`,
            [booking.batch_id, requesterId]
        );
        if (siblings.length > 0) bookings = siblings;
    }

    const total = round2(bookings.reduce((sum, b) => sum + Number(b.price), 0));
    if (!(total > 0)) throw new PaymentError(400, 'This booking has no price to pay.');

    return { primary: booking, bookings, ids: bookings.map((b) => b.booking_id), total, currency: CURRENCY };
}

/**
 * Mark the group PAID and write the HELD ledger rows, atomically. Idempotent:
 * a session that is already PAID is left alone (a retried capture can't
 * double-record). Returns how many sessions were newly recorded.
 */
async function recordPaymentSuccess({ group, payerId, method, externalRef }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const pct = feePercent();
        const refColumn = method === 'stripe' ? 'stripe_payment_intent_id' : 'paypal_capture_id';
        let recorded = 0;

        for (const b of group.bookings) {
            const price = round2(b.price);
            const fee = round2(price * pct / 100);

            const [upd] = await conn.execute(
                `UPDATE bookings
                 SET payment_status = 'PAID', payment_method = ?, amount = ?, ${refColumn} = ?
                 WHERE booking_id = ? AND payment_status IN ('UNPAID','FAILED')`,
                [method, price, externalRef, b.booking_id]
            );
            if (upd.affectedRows === 1) {
                await conn.execute(
                    `INSERT IGNORE INTO payments
                        (booking_id, payer_id, provider_id, method, external_ref, currency, amount, platform_fee, provider_amount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [b.booking_id, payerId, b.provider_id, method, externalRef, CURRENCY, price, fee, round2(price - fee)]
                );
                recorded++;
            }
        }
        await conn.commit();
        if (recorded) require('./realtime').notifyBookings(group.bookings.map((b) => b.booking_id), 'paid', payerId);
        return recorded;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

/** Flag the group FAILED (never overwrites PAID, so a duplicate/late failure can't undo a real payment). */
async function markFailed(ids) {
    if (!ids.length) return;
    await pool.query(
        `UPDATE bookings SET payment_status = 'FAILED'
         WHERE booking_id IN (?) AND payment_status IN ('UNPAID','FAILED')`,
        [ids]
    );
}

// ── Refunds ──────────────────────────────────────────────────────────────────

async function gatewayRefund(p) {
    if (p.method === 'paypal') {
        return paypal.refundCapture(p.external_ref, Number(p.amount), p.currency, `refund-payment-${p.payment_id}`);
    }
    if (p.method === 'stripe') {
        return stripeService.getStripe().refunds.create(
            { payment_intent: p.external_ref, amount: toCents(p.amount) },
            { idempotencyKey: `refund-payment-${p.payment_id}` }
        );
    }
    throw new Error(`Unknown payment method "${p.method}"`);
}

/**
 * Return the money for every held payment whose booking has been marked
 * REFUNDED (cancelled / declined / expired / account deleted), via the
 * gateway it came from. A gateway failure leaves the row REFUND_FAILED and is
 * retried on the next call — it never blocks the booking status change.
 */
async function settleRefunds() {
    const [rows] = await pool.execute(
        `SELECT p.payment_id, p.method, p.external_ref, p.amount, p.currency
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
         WHERE p.status IN ('HELD','REFUND_FAILED') AND b.payment_status = 'REFUNDED'`
    );

    let refunded = 0;
    for (const p of rows) {
        try {
            await gatewayRefund(p);
            await pool.execute(
                "UPDATE payments SET status = 'REFUNDED', refunded_at = NOW(), refund_error = NULL WHERE payment_id = ?",
                [p.payment_id]
            );
            refunded++;
        } catch (err) {
            await pool.execute(
                "UPDATE payments SET status = 'REFUND_FAILED', refund_error = ? WHERE payment_id = ?",
                [String(err.message).slice(0, 255), p.payment_id]
            );
            logAction(null, 'REFUND_FAILED', `payment: ${p.payment_id}`, null);
        }
    }
    return { attempted: rows.length, refunded };
}

/** HELD -> RELEASED for every payment whose booking is now COMPLETED. */
async function releaseCompleted() {
    const [result] = await pool.execute(
        `UPDATE payments p
         JOIN bookings b ON b.booking_id = p.booking_id
         SET p.status = 'RELEASED', p.released_at = NOW()
         WHERE p.status = 'HELD' AND b.status = 'COMPLETED'`
    );
    return result.affectedRows;
}

/** Run both settlement passes; never throws (callers fire-and-forget this). */
async function settle() {
    try {
        await releaseCompleted();
        return await settleRefunds();
    } catch (err) {
        console.error('payment settlement failed:', err.message);
        return null;
    }
}

module.exports = {
    CURRENCY,
    PaymentError,
    round2,
    toCents,
    feePercent,
    getPayableGroup,
    recordPaymentSuccess,
    markFailed,
    settleRefunds,
    releaseCompleted,
    settle,
};
