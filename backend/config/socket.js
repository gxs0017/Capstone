// config/socket.js
// Real-time layer: JWT-authenticated handshake, then three kinds of room.
//   conversation:<id>  chat messages (server-side participant check before joining)
//   user:<id>          a person's private channel — booking and payment changes
//   board / post:<id>  the community board (new posts, counts) and one open post's comments
// A failed handshake is written to the audit log (same as any other auth
// failure elsewhere in the app), including the IP it came from.

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Chat = require('../models/Chat');
const { logAction } = require('../models/AuditLog');

let io = null;

// userId -> Set<socketId>, so a freshly-created conversation can pull an
// already-connected participant into its room immediately (see
// joinUserToConversation), rather than waiting for their next reconnect.
const userSockets = new Map();

const roomName = (conversationId) => `conversation:${conversationId}`;
const userRoom = (userId) => `user:${userId}`;
const postRoom = (postId) => `post:${postId}`;
const BOARD_ROOM = 'board';

// Mirrors the x-forwarded-for handling Express's `trust proxy` gives req.ip,
// since Socket.IO's handshake doesn't go through Express's trust-proxy logic.
const handshakeIp = (socket) => {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return socket.handshake.address || null;
};

function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN || 'http://localhost:4200',
            methods: ['GET', 'POST'],
        },
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        const ip = handshakeIp(socket);

        if (!token) {
            logAction(null, 'CHAT_AUTH_FAILED', 'reason: no token', ip);
            return next(new Error('Authentication required.'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            logAction(null, 'CHAT_AUTH_FAILED', 'reason: invalid or expired token', ip);
            next(new Error('Invalid or expired token.'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;

        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket.id);

        // Private channel + the public board feed; joined synchronously on connect
        socket.join(userRoom(userId));
        socket.join(BOARD_ROOM);

        // Board posts are public, so any signed-in socket may watch one post's comments
        socket.on('post:join', (postId) => { if (Number.isInteger(Number(postId))) socket.join(postRoom(postId)); });
        socket.on('post:leave', (postId) => { socket.leave(postRoom(postId)); });

        // Listeners are registered synchronously, before any `await`, so a
        // 'conversation:join' the client fires right after connecting can
        // never race ahead of its own handler being attached (socket.io has
        // no server-side buffering for events emitted before a listener
        // exists — they'd just be dropped silently).
        socket.on('conversation:join', async (conversationId, ack) => {
            try {
                const allowed = await Chat.isParticipant(conversationId, userId);
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

        socket.on('conversation:leave', (conversationId) => {
            socket.leave(roomName(conversationId));
        });

        socket.on('disconnect', () => {
            const sockets = userSockets.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) userSockets.delete(userId);
            }
        });

        // Auto-join every conversation this user is already part of, so a
        // tab that only has the navbar open (not the /messages page) still
        // gets live 'message:new' events to keep the unread badge current.
        // Fired after the listeners above are attached, not awaited, so it
        // never delays (or races) handling the client's own first events.
        Chat.listConversationsForUser(userId)
            .then((conversations) => conversations.forEach((c) => socket.join(roomName(c.conversation_id))))
            .catch((err) => console.error('Error auto-joining conversation rooms:', err));
    });

    return io;
}

function emitToConversation(conversationId, event, payload) {
    if (!io) return;
    io.to(roomName(conversationId)).emit(event, payload);
}

/** Pull any of `userId`'s already-connected sockets into a (just-created) conversation's room. */
function joinUserToConversation(userId, conversationId) {
    if (!io) return;
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    for (const socketId of sockets) {
        io.sockets.sockets.get(socketId)?.join(roomName(conversationId));
    }
}

/** Private event for one person (all of their open tabs/devices). */
function emitToUser(userId, event, payload) {
    if (!io) return;
    io.to(userRoom(userId)).emit(event, payload);
}

/** Event for everyone watching the board feed. */
function emitToBoard(event, payload) {
    if (!io) return;
    io.to(BOARD_ROOM).emit(event, payload);
}

/** Event for everyone with one post open. */
function emitToPost(postId, event, payload) {
    if (!io) return;
    io.to(postRoom(postId)).emit(event, payload);
}

module.exports = { initSocket, emitToConversation, joinUserToConversation, emitToUser, emitToBoard, emitToPost };
