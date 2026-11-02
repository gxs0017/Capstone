// controllers/chatController.js
// Chat operations: conversations (one per person-pair), messages, and the
// "pin a booking" convenience feature. Any logged-in user can message any
// other — there is no booking-relationship gate on who can talk to whom.

const Chat = require('../models/Chat');
const pool = require('../config/db');
const { emitToConversation, joinUserToConversation } = require('../config/socket');
const { toConversationDTOList, toMessageDTOList, toBookingOptionDTOList } = require('../mappers/chatMapper');
const { logAction } = require('../models/AuditLog');
const { moderateMessage } = require('../utils/chatModeration');

// ----------------------------------------------------------------
// GET /chat/conversations — the current user's inbox list
// ----------------------------------------------------------------
const getConversations = async (req, res) => {
    try {
        const rows = await Chat.listConversationsForUser(req.user.id);
        return res.json(toConversationDTOList(rows, req.user.id));
    } catch (err) {
        console.error('getConversations error:', err);
        return res.status(500).json({ message: 'Error loading conversations.' });
    }
};

// ----------------------------------------------------------------
// GET /chat/unread-count — total unread messages across all conversations
// (powers the navbar badge without loading the full inbox)
// ----------------------------------------------------------------
const getUnreadCount = async (req, res) => {
    try {
        const total = await Chat.getUnreadCountForUser(req.user.id);
        return res.json({ total });
    } catch (err) {
        console.error('getUnreadCount error:', err);
        return res.status(500).json({ message: 'Error loading unread count.' });
    }
};

// ----------------------------------------------------------------
// POST /chat/conversations — get-or-create the conversation with otherUserId
// Body: { otherUserId, bookingId? }
// If bookingId is given, it becomes the conversation's pinned booking
// (this is how the "Message" button on a booking card works).
// ----------------------------------------------------------------
const startConversation = async (req, res) => {
    try {
        const otherId = Number(req.body.otherUserId);
        const bookingId = req.body.bookingId != null ? Number(req.body.bookingId) : null;

        if (otherId === req.user.id) {
            return res.status(400).json({ message: 'You cannot start a conversation with yourself.' });
        }

        const [users] = await pool.execute('SELECT user_id FROM users WHERE user_id = ? AND deleted_at IS NULL', [otherId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'The user you are trying to message does not exist.' });
        }

        const existing = await Chat.findConversationByPair(req.user.id, otherId);
        const conversation = await Chat.getOrCreateConversation(req.user.id, otherId, bookingId);

        if (!existing) {
            // Pull the other participant's already-connected socket(s) into the
            // new room right away, rather than waiting for their next reconnect.
            joinUserToConversation(otherId, conversation.conversation_id);
        }

        logAction(req.user.id, existing ? 'CONVERSATION_REUSED' : 'CONVERSATION_CREATED',
            'conversation: ' + conversation.conversation_id + ', with: ' + otherId, req.ip);

        return res.status(existing ? 200 : 201).json(toConversationDTOList([conversation], req.user.id)[0]);
    } catch (err) {
        console.error('startConversation error:', err);
        return res.status(500).json({ message: 'Error starting conversation.' });
    }
};

// ----------------------------------------------------------------
// GET /chat/conversations/:conversationId/booking-options
// Bookings shared between the two participants, for the "pin a booking" picker.
// ----------------------------------------------------------------
const getBookingOptions = async (req, res) => {
    try {
        const conversation = await Chat.getConversationById(req.params.conversationId);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
        if (conversation.participant_one_id !== req.user.id && conversation.participant_two_id !== req.user.id) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }

        const otherId = conversation.participant_one_id === req.user.id
            ? conversation.participant_two_id
            : conversation.participant_one_id;

        const rows = await Chat.getSharedBookings(req.user.id, otherId);
        return res.json(toBookingOptionDTOList(rows));
    } catch (err) {
        console.error('getBookingOptions error:', err);
        return res.status(500).json({ message: 'Error loading shared bookings.' });
    }
};

// ----------------------------------------------------------------
// PATCH /chat/conversations/:conversationId/pin — pin or unpin a booking
// Body: { bookingId: number | null }
// ----------------------------------------------------------------
const pinBooking = async (req, res) => {
    try {
        const conversation = await Chat.getConversationById(req.params.conversationId);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
        if (conversation.participant_one_id !== req.user.id && conversation.participant_two_id !== req.user.id) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }

        const bookingId = req.body.bookingId != null ? Number(req.body.bookingId) : null;

        // Only allow pinning a booking that's actually shared between the two of them.
        if (bookingId !== null) {
            const otherId = conversation.participant_one_id === req.user.id
                ? conversation.participant_two_id
                : conversation.participant_one_id;
            const shared = await Chat.getSharedBookings(req.user.id, otherId);
            if (!shared.some((b) => b.booking_id === bookingId)) {
                return res.status(400).json({ message: 'That booking is not shared with this person.' });
            }
        }

        await Chat.setPinnedBooking(conversation.conversation_id, bookingId);
        const updated = await Chat.getConversationById(conversation.conversation_id);
        return res.json(toConversationDTOList([updated], req.user.id)[0]);
    } catch (err) {
        console.error('pinBooking error:', err);
        return res.status(500).json({ message: 'Error updating pinned booking.' });
    }
};

// ----------------------------------------------------------------
// GET /chat/conversations/:conversationId/messages
// ----------------------------------------------------------------
const getMessages = async (req, res) => {
    try {
        const allowed = await Chat.isParticipant(req.params.conversationId, req.user.id);
        if (!allowed) return res.status(403).json({ message: 'You do not have access to this conversation.' });

        const rows = await Chat.listMessages(req.params.conversationId, req.user.id);
        return res.json(toMessageDTOList(rows, req.user.id));
    } catch (err) {
        console.error('getMessages error:', err);
        return res.status(500).json({ message: 'Error loading messages.' });
    }
};

// ----------------------------------------------------------------
// PATCH /chat/conversations/:conversationId/read
// ----------------------------------------------------------------
const markRead = async (req, res) => {
    try {
        const allowed = await Chat.isParticipant(req.params.conversationId, req.user.id);
        if (!allowed) return res.status(403).json({ message: 'You do not have access to this conversation.' });

        const markedRead = await Chat.markRead(req.params.conversationId, req.user.id);
        return res.json({ success: true, markedRead });
    } catch (err) {
        console.error('markRead error:', err);
        return res.status(500).json({ message: 'Error marking conversation as read.' });
    }
};

// ----------------------------------------------------------------
// POST /chat/conversations/:conversationId/messages
// Body: { content }
// req.ip is always used for ip_address — never a client-supplied value.
// ----------------------------------------------------------------
const sendMessage = async (req, res) => {
    try {
        const conversation = await Chat.getConversationById(req.params.conversationId);
        if (!conversation || (conversation.participant_one_id !== req.user.id && conversation.participant_two_id !== req.user.id)) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }
        if (conversation.read_only_for === req.user.id) {
            return res.status(403).json({ message: 'This is a notice from NeighborBook, so you cannot reply to it.' });
        }
        const otherId = conversation.participant_one_id === req.user.id ? conversation.participant_two_id : conversation.participant_one_id;

        const { flagged, reason } = moderateMessage(req.body.content);

        const message = await Chat.insertMessage({
            conversationId: req.params.conversationId,
            senderId: req.user.id,
            content: req.body.content,
            ip: req.ip,
            status: flagged ? 'BLOCKED' : 'SENT',
            flagReason: flagged ? reason : null,
        });

        // The text itself goes in the audit trail so an investigation can see exactly what was said
        logAction(req.user.id, flagged ? 'MESSAGE_FLAGGED' : 'MESSAGE_SENT',
            `to user ${otherId}, conversation ${req.params.conversationId}, message ${message.message_id}: "${req.body.content}"`
            + (flagged ? ` [held: ${reason}]` : ''), req.ip);

        // Held messages are never broadcast — the recipient must not see them
        // until (if ever) an admin approves them.
        if (!flagged) {
            emitToConversation(req.params.conversationId, 'message:new', toMessageDTOList([message], null)[0],
                [conversation.participant_one_id, conversation.participant_two_id]);
        }

        return res.status(201).json(toMessageDTOList([message], req.user.id)[0]);
    } catch (err) {
        console.error('sendMessage error:', err);
        return res.status(500).json({ message: 'Error sending message.' });
    }
};

module.exports = {
    getConversations,
    getUnreadCount,
    startConversation,
    getBookingOptions,
    pinBooking,
    getMessages,
    markRead,
    sendMessage,
};
