// utils/adminNotice.js
// When an admin cancels a booking, the requester and the provider each get the
// same formatted message from the admin in their Messages inbox:
//
//   Booking ID : 12
//   Date: ...
//   Service Provider: ...
//   Service Requester: ...
//   Reason: ...
//
//   Money will be refunded to the requester as this service is nulled.
//
// The requester's copy is a notice (read-only, no reply box); the provider can
// write back to ask why.

const pool = require('../config/db');
const Chat = require('../models/Chat');
const { emitToConversation, joinUserToConversation } = require('../config/socket');
const { toMessageDTOList } = require('../mappers/chatMapper');
const { notify } = require('./notify');

const stamp = (d) => (d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled');

const noticeText = (b, reason, closing = 'Money will be refunded to the requester as this service is nulled.') => [
    `Booking ID : ${b.booking_id}`,
    `Date: ${stamp(b.scheduled_date)}`,
    `Service Provider: ${b.provider_name}`,
    `Service Requester: ${b.requester_name}`,
    `Reason: ${reason}`,
    '',
    closing,
].join('\n');

/** Send `text` from the admin to one user in their admin conversation. */
const sendFromAdmin = async ({ adminId, userId, bookingId, text, readOnly }) => {
    const convo = await Chat.getOrCreateConversation(adminId, userId, bookingId);
    await Chat.setReadOnlyFor(convo.conversation_id, readOnly ? userId : null);
    const message = await Chat.insertMessage({ conversationId: convo.conversation_id, senderId: adminId, content: text, ip: null });
    if (!message) return null; // the person was removed while this was in flight
    joinUserToConversation(userId, convo.conversation_id);
    joinUserToConversation(adminId, convo.conversation_id);
    emitToConversation(convo.conversation_id, 'message:new', toMessageDTOList([message], null)[0], [adminId, userId]);
    return message;
};

/**
 * Message both parties about an admin cancellation.
 * @returns {{ text: string, requesterId: number, providerId: number } | null}
 */
const sendCancellationNotices = async ({ bookingId, adminId, reason, closing, headline, skipUserId }) => {
    const [rows] = await pool.execute(
        `SELECT b.booking_id, b.scheduled_date, b.requester_id, pd.user_id AS provider_id,
                CONCAT(rq.first_name, ' ', rq.last_name) AS requester_name,
                CONCAT(pv.first_name, ' ', pv.last_name) AS provider_name
         FROM bookings b
         JOIN provider_details pd ON pd.provider_detail_id = b.provider_detail_id
         JOIN users rq ON rq.user_id = b.requester_id
         JOIN users pv ON pv.user_id = pd.user_id
         WHERE b.booking_id = ?`,
        [bookingId]
    );
    const b = rows[0];
    if (!b) return null;

    const text = noticeText(b, reason, closing);
    // Both at once, so neither person waits on the other (skipUserId: someone who can no longer sign in)
    await Promise.all([
        b.requester_id !== skipUserId && sendFromAdmin({ adminId, userId: b.requester_id, bookingId, text, readOnly: true }),
        b.provider_id !== skipUserId && sendFromAdmin({ adminId, userId: b.provider_id, bookingId, text, readOnly: false }),
    ]);

    const body = `Booking #${b.booking_id} ${headline || 'was cancelled by an administrator'}. Reason: ${reason}. Open Messages for the details.`;
    [b.requester_id, b.provider_id].filter((id) => id !== skipUserId)
        .forEach((id) => notify(id, { type: 'ADMIN_MESSAGE', title: 'Message from admin', body, link: '/messages' }));
    return { text, requesterId: b.requester_id, providerId: b.provider_id };
};

module.exports = { sendCancellationNotices, sendFromAdmin, noticeText };
