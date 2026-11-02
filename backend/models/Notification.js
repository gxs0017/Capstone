// models/Notification.js
// A person's notification feed ("your service went live", "you received a booking"...).

const pool = require('../config/db');

const create = async (userId, { type, title, body = null, link = null }) => {
    const [result] = await pool.execute(
        'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
        [userId, type, String(title).slice(0, 120), body ? String(body).slice(0, 500) : null, link]
    );
    const [rows] = await pool.execute('SELECT * FROM notifications WHERE notification_id = ?', [result.insertId]);
    return rows[0];
};

const listForUser = async (userId, limit = 50) => {
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const [rows] = await pool.execute(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT ${safeLimit}`,
        [userId]
    );
    return rows;
};

const unreadCount = async (userId) => {
    const [[{ n }]] = await pool.execute(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId]);
    return Number(n);
};

const markRead = async (userId, notificationId) => {
    const [r] = await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?', [notificationId, userId]);
    return r.affectedRows > 0;
};

const markAllRead = async (userId) => {
    const [r] = await pool.execute(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [userId]);
    return r.affectedRows;
};

const toDTO = (r) => ({
    id: r.notification_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    isRead: !!r.is_read,
    createdAt: r.created_at,
});

module.exports = { create, listForUser, unreadCount, markRead, markAllRead, toDTO };
