// utils/notify.js
// One call to tell someone something: saved to their notification feed and
// pushed live to every tab they have open. Never throws — a notification
// hiccup must not break the action that caused it.

const Notification = require('../models/Notification');

const notify = async (userId, note) => {
    try {
        if (!userId) return null;
        const row = await Notification.create(userId, note);
        const { emitToUser } = require('../config/socket'); // lazy: socket.js loads models that load this file
        emitToUser(userId, 'notification:new', Notification.toDTO(row));
        return row;
    } catch (err) {
        console.error('notify failed:', err.message);
        return null;
    }
};

const notifyMany = (userIds, note) => Promise.all([...new Set(userIds)].map((id) => notify(id, note)));

module.exports = { notify, notifyMany };
