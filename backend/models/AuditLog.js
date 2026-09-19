// models/AuditLog.js
// Records account/security activity. Logging must never break the main request,
// so failures are swallowed (console only).
const pool = require('../config/db');

async function logAction(userId, action, details, ip) {
    try {
        await pool.execute(
            'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
            [userId ?? null, action, details ?? null, ip ?? null]
        );
    } catch (err) {
        console.error('audit log failed:', err.message);
    }
}

module.exports = { logAction };
