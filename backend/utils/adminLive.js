// utils/adminLive.js
// Platform numbers for the admin dashboard, pushed to every connected admin
// once a second (only while at least one admin is watching, so an idle server
// does no extra work).

const pool = require('../config/db');
const { emitToAdmins, adminsOnline, onlineUserCount } = require('../config/socket');

const STATS_SQL = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)                                   AS totalUsers,
      (SELECT COUNT(*) FROM users WHERE role = 'PROVIDER'  AND deleted_at IS NULL)            AS totalProviders,
      (SELECT COUNT(*) FROM users WHERE role = 'REQUESTER' AND deleted_at IS NULL)            AS totalRequesters,
      (SELECT COUNT(*) FROM users WHERE is_blocked = TRUE  AND deleted_at IS NULL)            AS blockedUsers,
      (SELECT COUNT(*) FROM bookings)                                                         AS totalBookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'PENDING')                                AS pendingBookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'CONFIRMED')                              AS confirmedBookings,
      (SELECT COUNT(*) FROM bookings WHERE issue_reported_at IS NOT NULL AND status = 'CONFIRMED') AS openIssues,
      (SELECT COUNT(*) FROM services)                                                         AS totalServices,
      (SELECT COUNT(*) FROM posts WHERE status = 'OPEN')                                      AS activePosts,
      (SELECT COUNT(*) FROM messages WHERE status = 'BLOCKED')                                AS flaggedMessages,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'HELD')                   AS heldAmount,
      (SELECT COUNT(*) FROM payouts WHERE status = 'REQUESTED')                               AS pendingPayouts,
      (SELECT COUNT(*) FROM audit_logs WHERE created_at >= CURDATE())                         AS actionsToday`;

const computeStats = async () => {
    const [[row]] = await pool.query(STATS_SQL);
    const stats = {};
    Object.keys(row).forEach((k) => { stats[k] = Number(row[k]); });
    stats.onlineNow = onlineUserCount();
    return stats;
};

let busy = false;
let warned = false;
const startAdminLive = () => {
    const tick = async () => {
        if (busy || !adminsOnline()) return;
        busy = true;
        try {
            emitToAdmins('admin:stats', await computeStats());
        } catch (err) {
            if (!warned) { warned = true; console.error('admin live stats failed (has run-operations-migration.js been run?):', err.message); }
        } finally {
            busy = false;
        }
    };
    return setInterval(tick, 1000).unref();
};

module.exports = { computeStats, startAdminLive };
