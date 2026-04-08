// controllers/adminController.js
// Admin-only operations: user management (CRUD), block/unblock, dashboard stats.
// All endpoints require ADMIN role via middleware.

const pool = require('../config/db');
const { toAdminUserDTO, toAdminUserDTOList } = require('../mappers/userMapper');

// ----------------------------------------------------------------
// GET /api/admin/users — paginated list of all users
// Query params: role, search, page, limit
// ----------------------------------------------------------------
const listUsers = async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;

        const safePage  = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const offset    = (safePage - 1) * safeLimit;

        let whereExtra = '';
        const params = [];

        if (role && ['PROVIDER', 'REQUESTER', 'ADMIN'].includes(role)) {
            whereExtra += ' AND role = ?';
            params.push(role);
        }

        if (search) {
            whereExtra += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        // Count
        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) AS total FROM users WHERE 1=1 ${whereExtra}`,
            params
        );

        // Data
        const [rows] = await pool.execute(
            `SELECT * FROM users WHERE 1=1 ${whereExtra}
             ORDER BY created_at DESC
             LIMIT ${safeLimit} OFFSET ${offset}`,
            params
        );

        return res.json({
            data:       toAdminUserDTOList(rows),
            total,
            page:       safePage,
            limit:      safeLimit,
            totalPages: Math.ceil(total / safeLimit),
        });
    } catch (err) {
        console.error('Admin listUsers error:', err);
        return res.status(500).json({ message: 'Error fetching users.' });
    }
};

// ----------------------------------------------------------------
// GET /api/admin/users/:id — single user detail
// ----------------------------------------------------------------
const getUserById = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE user_id = ?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        return res.json(toAdminUserDTO(rows[0]));
    } catch (err) {
        console.error('Admin getUserById error:', err);
        return res.status(500).json({ message: 'Error fetching user.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/admin/users/:id/block — toggle block status
// Body: { blocked: true/false }
// ----------------------------------------------------------------
const toggleBlock = async (req, res) => {
    try {
        const { blocked } = req.body;
        if (typeof blocked !== 'boolean') {
            return res.status(400).json({ message: 'Field "blocked" (boolean) is required.' });
        }

        // Don't let admins block themselves
        if (parseInt(req.params.id, 10) === req.user.id) {
            return res.status(400).json({ message: 'Blocking or deleting your own account is not allowed.' });
        }

        // Prevent blocking other admins
        const [targetRows] = await pool.execute('SELECT role FROM users WHERE user_id = ?', [req.params.id]);
        if (targetRows.length > 0 && targetRows[0].role === 'ADMIN') {
            return res.status(400).json({ message: 'Blocking or deleting an admin user is not allowed.' });
        }

        const [result] = await pool.execute(
            'UPDATE users SET is_blocked = ? WHERE user_id = ?',
            [blocked, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        return res.json({
            message: blocked ? 'User has been blocked.' : 'User has been unblocked.',
        });
    } catch (err) {
        console.error('Admin toggleBlock error:', err);
        return res.status(500).json({ message: 'Error updating user status.' });
    }
};

// ----------------------------------------------------------------
// DELETE /api/admin/users/:id — permanently delete a user
// ----------------------------------------------------------------
const deleteUser = async (req, res) => {
    try {
        if (parseInt(req.params.id, 10) === req.user.id) {
            return res.status(400).json({ message: 'Blocking or deleting your own account is not allowed.' });
        }

        // Prevent deleting other admins
        const [targetRows] = await pool.execute('SELECT role FROM users WHERE user_id = ?', [req.params.id]);
        if (targetRows.length > 0 && targetRows[0].role === 'ADMIN') {
            return res.status(400).json({ message: 'Blocking or deleting an admin user is not allowed.' });
        }

        const [result] = await pool.execute(
            'DELETE FROM users WHERE user_id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        return res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Admin deleteUser error:', err);
        return res.status(500).json({ message: 'Error deleting user.' });
    }
};

// ----------------------------------------------------------------
// GET /api/admin/stats — dashboard stats
// ----------------------------------------------------------------
const getStats = async (_req, res) => {
    try {
        const [[{ totalUsers }]]     = await pool.execute('SELECT COUNT(*) AS totalUsers FROM users');
        const [[{ totalProviders }]] = await pool.execute("SELECT COUNT(*) AS totalProviders FROM users WHERE role = 'PROVIDER'");
        const [[{ totalRequesters }]]= await pool.execute("SELECT COUNT(*) AS totalRequesters FROM users WHERE role = 'REQUESTER'");
        const [[{ totalBookings }]]  = await pool.execute('SELECT COUNT(*) AS totalBookings FROM bookings');
        const [[{ pendingBookings }]]= await pool.execute("SELECT COUNT(*) AS pendingBookings FROM bookings WHERE status = 'PENDING'");
        const [[{ blockedUsers }]]   = await pool.execute('SELECT COUNT(*) AS blockedUsers FROM users WHERE is_blocked = TRUE');
        const [[{ totalServices }]]  = await pool.execute('SELECT COUNT(*) AS totalServices FROM services');

        return res.json({
            totalUsers,
            totalProviders,
            totalRequesters,
            totalBookings,
            pendingBookings,
            blockedUsers,
            totalServices,
        });
    } catch (err) {
        console.error('Admin getStats error:', err);
        return res.status(500).json({ message: 'Error fetching stats.' });
    }
};

module.exports = { listUsers, getUserById, toggleBlock, deleteUser, getStats };
