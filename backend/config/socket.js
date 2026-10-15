const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./db');

let io = null;

//user ID validation
async function isParticipant(conversationId, userId) {
    const [rows] = await pool.execute(
        `SELECT 1 FROM conversations
         WHERE conversation_id = ?
         AND (participant_one_id = ? OR participant_two_id = ?)
         LIMIT 1`,
        [conversationId, userId, userId]
    );
    return rows.length > 0;
}

//attaches the ocket ontoothe running web server
function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN || 'http://localhost:4200',
            methods: ['GET', 'POST'],
        },
    });

    // validation that connect with the token. if invalid it rejects the connection entirely
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication required.'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid or expired token.'));
        }
    });

    // runs when the socket connects
    io.on('connection', (socket) => {
        const userId = socket.user.id;

        // after validating the user ids to the room ids, it directs users to the chatroom
        socket.on('conversation:join', async (conversationId, ack) => {
            try {
                const allowed = await isParticipant(conversationId, userId);
                if (!allowed) {
                    if (typeof ack === 'function') ack({ ok: false, error: 'Not authorized for this conversation.' });
                    return;
                }
                socket.join(roomName(conversationId));
                if (typeof ack === 'function') ack({ ok: true });
            } catch (err) {
                console.error('conversation:join error:', err);
                if (typeof ack === 'function') ack({ ok: false, error: 'Server error joining conversation.' });
            }
        });

        // leaves the conversation when it detects that you have entered a different one
        socket.on('conversation:leave', (conversationId) => {
            socket.leave(roomName(conversationId));
        });

        // socket is disconnected when the tab is closed
        socket.on('disconnect', () => {
        });
    });

    return io;
}

//give the chatrrom an name based on the ID
function roomName(conversationId) {
    return `conversation:${conversationId}`;
}

//sends the sent message to all the participants in the chatroom
function emitToConversation(conversationId, event, payload) {
    if (!io) return;
    io.to(roomName(conversationId)).emit(event, payload);
}

module.exports = { initSocket, emitToConversation };
