// controllers/notificationController.js
// The signed-in user's notification feed.

const Notification = require('../models/Notification');

// GET /notifications — latest notifications + how many are unread
const getNotifications = async (req, res) => {
    try {
        const [rows, unread] = await Promise.all([
            Notification.listForUser(req.user.id, req.query.limit),
            Notification.unreadCount(req.user.id),
        ]);
        return res.json({ unread, data: rows.map(Notification.toDTO) });
    } catch (err) {
        console.error('getNotifications error:', err);
        return res.status(500).json({ message: 'Error loading notifications.' });
    }
};

// PATCH /notifications/:id/read
const markRead = async (req, res) => {
    try {
        await Notification.markRead(req.user.id, Number(req.params.id));
        return res.json({ unread: await Notification.unreadCount(req.user.id) });
    } catch (err) {
        console.error('markNotificationRead error:', err);
        return res.status(500).json({ message: 'Error updating the notification.' });
    }
};

// PATCH /notifications/read-all
const markAllRead = async (req, res) => {
    try {
        await Notification.markAllRead(req.user.id);
        return res.json({ unread: 0 });
    } catch (err) {
        console.error('markAllNotificationsRead error:', err);
        return res.status(500).json({ message: 'Error updating notifications.' });
    }
};

module.exports = { getNotifications, markRead, markAllRead };
