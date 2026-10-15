const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { checkBlocked } = require('../middleware/roles');
const { emitToConversation } = require('../config/socket');

// all chatting needs a loggd in user that isnt blocked by an admin
router.use(authMiddleware, checkBlocked);

// Maximum allowed length of a single message, in characters.
const MAX_MESSAGE_LENGTH = 500;

// security safeguards & message clean up
//string(raw) makes sure that request are accepted as strings
//trim() removes the un needed parts of a sent message
//protect against control characters 
function sanitizeMessageContent(raw) {
    return String(raw)
        .trim()
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

//checks if the user is allowed to be within the chatroom
async function getConversationForParticipant(conversationId, userId) {
    const [rows] = await pool.execute(
        `SELECT * FROM conversations
         WHERE conversation_id = ?
           AND (participant_one_id = ? OR participant_two_id = ?)`,
        [conversationId, userId, userId]
    );
    return rows.length ? rows[0] : null;
}

// endpoint that loads the inbox list
// finds chatrooms where the user is the first or second participant
// grabs the names
// count un seen messages
// sorts by most recent message recieved
router.get('/conversations', async (req, res) => {
    const userId = req.user.id;

    const query = `
        SELECT c.*,
               u1.first_name AS p1_first, u1.last_name AS p1_last,
               u2.first_name AS p2_first, u2.last_name AS p2_last,
               (
                    SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.conversation_id 
                    AND m.sender_id <> ?
                    AND m.is_read = FALSE
               ) AS unread_count
        FROM conversations c
        JOIN users u1 ON c.participant_one_id = u1.user_id
        JOIN users u2 ON c.participant_two_id = u2.user_id
        WHERE c.participant_one_id = ? OR c.participant_two_id = ?
        ORDER BY c.updated_at DESC
    `;

    try {
        const [results] = await pool.execute(query, [userId, userId, userId]);
        res.json(results);
    } catch (err) {
        console.error('getConversations error:', err);
        res.status(500).json({ message: 'Server error loading conversations.' });
    }
});

//creates or direct users to a new or existing chatroom
router.post('/conversations', async (req, res) => {
    const userId = req.user.id;
    const { otherUserId, bookingId } = req.body;

    // Validate the other participant id.
    const otherId = Number(otherUserId);
    if (!Number.isInteger(otherId) || otherId <= 0) {
        return res.status(400).json({ message: 'A valid otherUserId is required.' });
    }

    /*
    if (otherId === userId) {
        return res.status(400).json({ message: 'You cannot start a conversation with yourself.' });
    }
    */

    try {
        // checks if the user is still valid
        const [users] = await pool.execute(
            'SELECT user_id FROM users WHERE user_id = ?',
            [otherId]
        );
        if (users.length === 0) {
            return res.status(404).json({ message: 'The user you are trying to message does not exist.' });
        }

        // checks if a chatroom is already made between the two user ids
        const [existing] = await pool.execute(
            `SELECT * FROM conversations
             WHERE (participant_one_id = ? AND participant_two_id = ?)
                OR (participant_one_id = ? AND participant_two_id = ?)
             LIMIT 1`,
            [userId, otherId, otherId, userId]
        );
        if (existing.length > 0) {
            return res.status(200).json({ ...existing[0], existing: true });
        }

        // makes a new chatroom
        const bookingIdValue = Number.isInteger(Number(bookingId)) ? Number(bookingId) : null;
        const [result] = await pool.execute(
            `INSERT INTO conversations (participant_one_id, participant_two_id, booking_id)
             VALUES (?, ?, ?)`,
            [userId, otherId, bookingIdValue]
        );

        const [created] = await pool.execute(
            'SELECT * FROM conversations WHERE conversation_id = ?',
            [result.insertId]
        );

        res.status(201).json({ ...created[0], existing: false });
    } catch (err) {
        console.error('createConversation error:', err);
        res.status(500).json({ message: 'Server error creating conversation.' });
    }
});

// getsthe messages 
router.get('/conversations/:conversationId/messages', async (req, res) => {
    const userId = req.user.id;
    const { conversationId } = req.params;

    try {
        const conversation = await getConversationForParticipant(conversationId, userId);
        if (!conversation) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }

        const [results] = await pool.execute(
            `SELECT * FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC`,
            [conversationId]
        );
        res.json(results);
    } catch (err) {
        console.error('getMessages error:', err);
        res.status(500).json({ message: 'Server error loading messages.' });
    }
});

// mark as read red badge update
router.patch('/conversations/:conversationId/read', async (req, res) => {
    const userId = req.user.id;
    const { conversationId } = req.params;

    try {
        const conversation = await getConversationForParticipant(conversationId, userId);
        if (!conversation) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }

        const [result] = await pool.execute(
            `UPDATE messages
             SET is_read = TRUE
             WHERE conversation_id = ?
               AND sender_id <> ?
               AND is_read = FALSE`,
            [conversationId, userId]
        );

        res.json({ success: true, markedRead: result.affectedRows });
    } catch (err) {
        console.error('markRead error:', err);
        res.status(500).json({ message: 'Server error marking conversation as read.' });
    }
});

//sending a message
//makes empty messages cant be sent
//doesnt let you sent messages that are too long
//takes the sender ID from the token
//sends the message to everyones chatroom through the socket
router.post('/conversations/:conversationId/messages', async (req, res) => {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { content } = req.body;

    if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: 'Message content cannot be empty.' });
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
            message: `Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
        });
    }

    const safeContent = sanitizeMessageContent(content);

    if (safeContent.length === 0) {
        return res.status(400).json({ message: 'Message content is invalid.' });
    }

    try {
        const conversation = await getConversationForParticipant(conversationId, userId);
        if (!conversation) {
            return res.status(403).json({ message: 'You do not have access to this conversation.' });
        }

        const [result] = await pool.execute(
            `INSERT INTO messages (conversation_id, sender_id, content)
             VALUES (?, ?, ?)`,
            [conversationId, userId, safeContent]
        );

        await pool.execute(
            `UPDATE conversations SET updated_at = NOW() WHERE conversation_id = ?`,
            [conversationId]
        );

        const [rows] = await pool.execute(
            'SELECT * FROM messages WHERE message_id = ?',
            [result.insertId]
        );
        const message = rows[0];

        emitToConversation(conversationId, 'message:new', message);

        res.status(201).json({ success: true, messageId: result.insertId, message });
    } catch (err) {
        console.error('sendMessage error:', err);
        res.status(500).json({ message: 'Server error sending message.' });
    }
});

module.exports = router;
