// utils/realtime.js
// Tells the people involved in a booking that it changed, the moment it does,
// so their open pages update without a refresh. Failure-safe: a real-time
// hiccup must never break the request that triggered it.

const pool = require('../config/db');

/** Emit `booking:changed` to the requester and provider of each booking id.
 *  `actorId` is who caused it, so the page can skip a pop-up for their own action. */
const notifyBookings = async (bookingIds, reason = 'updated', actorId = null) => {
    try {
        const ids = [].concat(bookingIds).filter(Boolean);
        if (ids.length === 0) return;
        const { emitToUser } = require('../config/socket'); // lazy: socket.js loads models that load this file
        const [rows] = await pool.query(
            `SELECT b.booking_id, b.status, b.payment_status, b.requester_id, d.user_id AS provider_id
             FROM bookings b JOIN provider_details d ON d.provider_detail_id = b.provider_detail_id
             WHERE b.booking_id IN (?)`,
            [ids]
        );
        for (const r of rows) {
            const payload = { bookingId: r.booking_id, status: r.status, paymentStatus: r.payment_status, reason, actorId };
            emitToUser(r.requester_id, 'booking:changed', payload);
            emitToUser(r.provider_id, 'booking:changed', payload);
        }
    } catch (err) {
        console.error('notifyBookings failed:', err.message);
    }
};

module.exports = { notifyBookings };
