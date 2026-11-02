// utils/realtime.js
// Tells the people involved in a booking that it changed, the moment it does:
//   - `booking:changed` so their open pages update without a refresh, and
//   - a saved notification ("you received a booking", "payment received"...).
// Failure-safe: a real-time hiccup must never break the request that triggered it.

const pool = require('../config/db');
const { notify } = require('./notify');

const when = (d) => (d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'the scheduled time');
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

/** Who hears what for each kind of booking change. `by` is 'requester' | 'provider' | 'admin' | 'system'. */
const notices = (reason, b, by) => {
    const svc = b.service_name;
    const date = when(b.scheduled_date);
    const mine = '/my-bookings';
    const incoming = '/requests';
    const why = (text) => (text ? ` Reason: ${text}` : '');

    switch (reason) {
        case 'created':
            return {
                provider:  { type: 'BOOKING_RECEIVED', title: 'New booking request', body: `${b.requester_name} requested ${svc} for ${date}.`, link: incoming },
                requester: { type: 'BOOKING_SENT', title: 'Booking request sent', body: `Your request for ${svc} with ${b.provider_name} (${date}) is waiting for them to accept.`, link: mine },
            };
        case 'confirmed':
            return { requester: { type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: `${b.provider_name} confirmed your ${svc} on ${date}.`, link: mine } };
        case 'declined':
            return { requester: { type: 'BOOKING_DECLINED', title: 'Booking declined', body: `${b.provider_name} couldn't take your ${svc} request.${why(b.decline_reason)}${b.payment_status === 'REFUNDED' ? ' Your payment is being refunded.' : ''}`, link: mine } };
        case 'cancelled': {
            const refund = b.payment_status === 'REFUNDED' ? ' The payment is being refunded to the requester.' : '';
            const to = {
                requester: { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${svc} on ${date} was cancelled${by === 'admin' ? ' by an administrator' : ` by ${b.provider_name}`}.${why(b.cancel_reason)}${refund}`, link: mine },
                provider:  { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${svc} on ${date} was cancelled${by === 'admin' ? ' by an administrator' : ` by ${b.requester_name}`}.${why(b.cancel_reason)}`, link: incoming },
            };
            if (by === 'requester') delete to.requester;
            if (by === 'provider') delete to.provider;
            return to;
        }
        case 'completed':
            return {
                requester: { type: 'BOOKING_COMPLETED', title: 'Booking completed', body: `${svc} with ${b.provider_name} is done. How did it go? You can leave a review.`, link: mine },
                provider:  { type: 'BOOKING_COMPLETED', title: 'Job completed', body: `${svc} for ${b.requester_name} is complete.${b.payment_status === 'PAID' ? ' Your earnings are being credited.' : ''}`, link: incoming },
            };
        case 'paid':
            return {
                requester: { type: 'PAYMENT_MADE', title: 'Payment successful', body: `You paid ${money(b.amount)} for ${svc} with ${b.provider_name}. It is held safely until the job is done.`, link: '/wallet' },
                provider:  { type: 'PAYMENT_RECEIVED', title: 'Payment received', body: `${b.requester_name} paid ${money(b.amount)} for ${svc} (${date}). It will be credited to your balance after the job.`, link: '/wallet' },
            };
        case 'issue':
            return {
                provider:  { type: 'BOOKING_ISSUE', title: 'Issue reported', body: `${b.requester_name} reported a problem with ${svc} on ${date}. The payment is on hold while it is reviewed.`, link: incoming },
                requester: { type: 'BOOKING_ISSUE', title: 'Issue reported', body: `We received your report about ${svc}. The payment stays on hold while an administrator reviews it.`, link: mine },
            };
        case 'expired':
            return {
                requester: { type: 'BOOKING_EXPIRED', title: 'Booking request expired', body: `${b.provider_name} didn't respond to your ${svc} request in time.${b.payment_status === 'REFUNDED' ? ' Your payment is being refunded.' : ''}`, link: mine },
                provider:  { type: 'BOOKING_EXPIRED', title: 'Booking request expired', body: `A ${svc} request from ${b.requester_name} expired before you answered.`, link: incoming },
            };
        default:
            return {};
    }
};

/** Emit `booking:changed` to the requester and provider of each booking id, and
 *  notify them. `actorId` is who caused it, so the page can skip a pop-up for their own action. */
const notifyBookings = async (bookingIds, reason = 'updated', actorId = null) => {
    try {
        const ids = [].concat(bookingIds).filter(Boolean);
        if (ids.length === 0) return;
        const { emitToUser } = require('../config/socket'); // lazy: socket.js loads models that load this file
        const [rows] = await pool.query(
            `SELECT b.booking_id, b.status, b.payment_status, b.requester_id, b.scheduled_date, b.amount, b.price,
                    b.decline_reason, b.cancel_reason, d.user_id AS provider_id, s.service_name,
                    CONCAT(rq.first_name, ' ', rq.last_name) AS requester_name,
                    CONCAT(pv.first_name, ' ', pv.last_name) AS provider_name
             FROM bookings b
             JOIN provider_details d ON d.provider_detail_id = b.provider_detail_id
             JOIN services s ON s.service_id = b.service_id
             JOIN users rq ON rq.user_id = b.requester_id
             JOIN users pv ON pv.user_id = d.user_id
             WHERE b.booking_id IN (?)`,
            [ids]
        );
        // A weekly pack changes together: one notification per person, not one per session
        const told = new Set();
        const packTotal = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        for (const r of rows) {
            const payload = { bookingId: r.booking_id, status: r.status, paymentStatus: r.payment_status, reason, actorId };
            emitToUser(r.requester_id, 'booking:changed', payload);
            emitToUser(r.provider_id, 'booking:changed', payload);

            const by = actorId == null ? 'system'
                : actorId === r.requester_id ? 'requester'
                : actorId === r.provider_id ? 'provider' : 'admin';
            const note = notices(reason, reason === 'paid' ? { ...r, amount: packTotal } : r, by);
            if (note.requester && !told.has(`r${r.requester_id}`)) {
                told.add(`r${r.requester_id}`);
                notify(r.requester_id, note.requester);
            }
            if (note.provider && !told.has(`p${r.provider_id}`)) {
                told.add(`p${r.provider_id}`);
                notify(r.provider_id, note.provider);
            }
        }
    } catch (err) {
        console.error('notifyBookings failed:', err.message);
    }
};

module.exports = { notifyBookings };
