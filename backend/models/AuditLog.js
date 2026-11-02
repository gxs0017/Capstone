// models/AuditLog.js
// Records everything people do on the platform (sign-ins, bookings, payments,
// messages, posts, services...). Logging must never break the main request,
// so failures are swallowed (console only). Every entry is also pushed live
// to the admins' Logs tab.
const pool = require('../config/db');

const DETAILS_MAX = 1000;

const ENTRY_SELECT = `
    SELECT a.audit_id, a.user_id, a.action, a.details, a.ip_address, a.created_at,
           u.first_name, u.last_name, u.email, u.role
    FROM audit_logs a
    LEFT JOIN users u ON u.user_id = a.user_id`;

const toEntry = (r) => ({
    audit_id: r.audit_id,
    user_id: r.user_id,
    user_name: r.first_name ? `${r.first_name} ${r.last_name}` : null,
    user_email: r.email || null,
    user_role: r.role || null,
    action: r.action,
    details: r.details,
    ip_address: r.ip_address,
    created_at: r.created_at,
});

async function logAction(userId, action, details, ip) {
    try {
        const text = details == null ? null : String(details).slice(0, DETAILS_MAX);
        const [result] = await pool.execute(
            'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
            [userId ?? null, action, text, ip ?? null]
        );
        const { emitToAdmins, adminsOnline } = require('../config/socket'); // lazy: socket.js loads this file
        if (adminsOnline()) {
            const [rows] = await pool.execute(`${ENTRY_SELECT} WHERE a.audit_id = ?`, [result.insertId]);
            if (rows[0]) emitToAdmins('audit:new', toEntry(rows[0]));
        }
    } catch (err) {
        console.error('audit log failed:', err.message);
    }
}

/**
 * Filtered, newest-first audit trail.
 * filters: { userId, user (name/email/id text), action, search, from, to, beforeId, limit }
 */
async function listAudit({ userId, user, action, search, from, to, beforeId, limit } = {}) {
    const safeLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const where = [];
    const params = [];
    if (userId) { where.push('a.user_id = ?'); params.push(Number(userId)); }
    if (user) {
        const term = `%${String(user).trim()}%`;
        where.push("(CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR u.email LIKE ? OR CAST(a.user_id AS CHAR) = ?)");
        params.push(term, term, String(user).trim());
    }
    if (action) { where.push('a.action LIKE ?'); params.push(`${String(action).trim()}%`); }
    if (search) {
        where.push('(a.details LIKE ? OR a.action LIKE ? OR a.ip_address LIKE ?)');
        const term = `%${String(search).trim()}%`;
        params.push(term, term, term);
    }
    if (from) { where.push('a.created_at >= ?'); params.push(from); }
    if (to)   { where.push('a.created_at <= ?'); params.push(to); }
    if (beforeId) { where.push('a.audit_id < ?'); params.push(Number(beforeId)); }

    const [rows] = await pool.execute(
        `${ENTRY_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY a.audit_id DESC LIMIT ${safeLimit}`,
        params
    );
    return rows.map(toEntry);
}

module.exports = { logAction, listAudit, toEntry };
