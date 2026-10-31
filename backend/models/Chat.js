// models/Chat.js
// MySQL query functions for the chat feature (conversations + messages).
// Shared by chatController (REST) and config/socket.js (room auth), same
// pattern as models/User.js — all DB access goes through the shared pool.

const pool = require('../config/db');

// ── Conversations ────────────────────────────────────────────────────────────

// Always store the smaller user_id first so the same pair collides on the
// same row regardless of who started the conversation.
const normalizePair = (userA, userB) => (userA < userB ? [userA, userB] : [userB, userA]);

const findConversationByPair = async (userA, userB) => {
    const [p1, p2] = normalizePair(userA, userB);
    const [rows] = await pool.execute(
        'SELECT * FROM conversations WHERE participant_one_id = ? AND participant_two_id = ?',
        [p1, p2]
    );
    return rows[0] || null;
};

const getConversationById = async (conversationId) => {
    const [rows] = await pool.execute(
        `SELECT c.*,
                u1.first_name AS p1_first, u1.last_name AS p1_last,
                u2.first_name AS p2_first, u2.last_name AS p2_last
         FROM conversations c
         JOIN users u1 ON c.participant_one_id = u1.user_id
         JOIN users u2 ON c.participant_two_id = u2.user_id
         WHERE c.conversation_id = ?`,
        [conversationId]
    );
    return rows[0] || null;
};

const createConversation = async (userA, userB, bookingId = null) => {
    const [p1, p2] = normalizePair(userA, userB);
    const [result] = await pool.execute(
        'INSERT INTO conversations (participant_one_id, participant_two_id, booking_id) VALUES (?, ?, ?)',
        [p1, p2, bookingId]
    );
    return getConversationById(result.insertId);
};

/** Create-or-get the one conversation for this pair. If `bookingId` is given,
 *  it becomes (or replaces) the pinned booking — the clearest signal of what
 *  the user wants shown is "the booking they just clicked Message from". */
const getOrCreateConversation = async (userA, userB, bookingId = null) => {
    const existing = await findConversationByPair(userA, userB);
    if (existing) {
        if (bookingId != null && bookingId !== existing.booking_id) {
            await setPinnedBooking(existing.conversation_id, bookingId);
        }
        return getConversationById(existing.conversation_id);
    }
    return createConversation(userA, userB, bookingId);
};

const setPinnedBooking = async (conversationId, bookingId /* null to unpin */) => {
    await pool.execute(
        'UPDATE conversations SET booking_id = ? WHERE conversation_id = ?',
        [bookingId, conversationId]
    );
};

const isParticipant = async (conversationId, userId) => {
    const [rows] = await pool.execute(
        `SELECT 1 FROM conversations
         WHERE conversation_id = ? AND (participant_one_id = ? OR participant_two_id = ?)
         LIMIT 1`,
        [conversationId, userId, userId]
    );
    return rows.length > 0;
};

/** Conversations for a user's inbox list: other participant's name + unread count. */
const listConversationsForUser = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT c.*,
                u1.first_name AS p1_first, u1.last_name AS p1_last,
                u2.first_name AS p2_first, u2.last_name AS p2_last,
                (SELECT COUNT(*) FROM messages m
                  WHERE m.conversation_id = c.conversation_id
                    AND m.sender_id <> ?
                    AND m.is_read = FALSE
                    AND m.status IN ('SENT','APPROVED')) AS unread_count
         FROM conversations c
         JOIN users u1 ON c.participant_one_id = u1.user_id
         JOIN users u2 ON c.participant_two_id = u2.user_id
         WHERE c.participant_one_id = ? OR c.participant_two_id = ?
         ORDER BY c.updated_at DESC`,
        [userId, userId, userId]
    );
    return rows;
};

const getUnreadCountForUser = async (userId) => {
    const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) AS total FROM messages m
         JOIN conversations c ON c.conversation_id = m.conversation_id
         WHERE (c.participant_one_id = ? OR c.participant_two_id = ?)
           AND m.sender_id <> ?
           AND m.is_read = FALSE
           AND m.status IN ('SENT','APPROVED')`,
        [userId, userId, userId]
    );
    return total;
};

/** Bookings shared between two users (either direction), for the "pin a booking" picker. */
const getSharedBookings = async (userA, userB) => {
    const [rows] = await pool.execute(
        `SELECT b.booking_id, b.status, b.scheduled_date, b.price, b.payment_status,
                s.service_name,
                req.user_id AS requester_id, prov.user_id AS provider_id
         FROM bookings b
         JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
         JOIN users prov ON pd.user_id = prov.user_id
         JOIN users req  ON b.requester_id = req.user_id
         JOIN services s ON b.service_id = s.service_id
         WHERE (b.requester_id = ? AND pd.user_id = ?)
            OR (b.requester_id = ? AND pd.user_id = ?)
         ORDER BY b.booking_date DESC`,
        [userA, userB, userB, userA]
    );
    return rows;
};

// ── Messages ──────────────────────────────────────────────────────────────────

/** Messages visible to `viewerId`: everyone's SENT/APPROVED messages, plus the
 *  viewer's own BLOCKED/REJECTED ones (so they see their own held/rejected placeholder). */
const listMessages = async (conversationId, viewerId) => {
    const [rows] = await pool.execute(
        `SELECT * FROM messages
         WHERE conversation_id = ?
           AND (status IN ('SENT', 'APPROVED') OR sender_id = ?)
         ORDER BY created_at ASC`,
        [conversationId, viewerId]
    );
    return rows;
};

const getMessageById = async (messageId) => {
    const [rows] = await pool.execute('SELECT * FROM messages WHERE message_id = ?', [messageId]);
    return rows[0] || null;
};

const insertMessage = async ({ conversationId, senderId, content, ip, status = 'SENT', flagReason = null }) => {
    const [result] = await pool.execute(
        `INSERT INTO messages (conversation_id, sender_id, content, ip_address, status, flag_reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [conversationId, senderId, content, ip ?? null, status, flagReason]
    );
    await pool.execute('UPDATE conversations SET updated_at = NOW() WHERE conversation_id = ?', [conversationId]);
    return getMessageById(result.insertId);
};

const markRead = async (conversationId, userId) => {
    const [result] = await pool.execute(
        `UPDATE messages
         SET is_read = TRUE
         WHERE conversation_id = ? AND sender_id <> ? AND is_read = FALSE AND status IN ('SENT','APPROVED')`,
        [conversationId, userId]
    );
    return result.affectedRows;
};

// ── Moderation (admin) ───────────────────────────────────────────────────────

const listFlaggedMessages = async (limit = 100) => {
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const [rows] = await pool.execute(
        `SELECT m.*, u.first_name AS sender_first, u.last_name AS sender_last
         FROM messages m
         JOIN users u ON m.sender_id = u.user_id
         WHERE m.status = 'BLOCKED'
         ORDER BY m.created_at DESC
         LIMIT ${safeLimit}`
    );
    return rows;
};

/** Admin approves (delivers) or rejects (keeps hidden) a held message. */
const reviewMessage = async (messageId, adminId, approve) => {
    const [result] = await pool.execute(
        `UPDATE messages
         SET status = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE message_id = ? AND status = 'BLOCKED'`,
        [approve ? 'APPROVED' : 'REJECTED', adminId, messageId]
    );
    if (result.affectedRows === 0) return null;
    return getMessageById(messageId);
};

module.exports = {
    normalizePair,
    findConversationByPair,
    getConversationById,
    createConversation,
    getOrCreateConversation,
    setPinnedBooking,
    isParticipant,
    listConversationsForUser,
    getUnreadCountForUser,
    getSharedBookings,
    listMessages,
    getMessageById,
    insertMessage,
    markRead,
    listFlaggedMessages,
    reviewMessage,
};
