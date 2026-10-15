// controllers/adminController.js
// Admin-only operations: user management (CRUD), block/unblock, dashboard stats.
// All endpoints require ADMIN role via middleware.

const pool = require('../config/db');
const { toAdminUserDTO, toAdminUserDTOList, toBookingDTOList } = require('../mappers/userMapper');
const { expireStalePending } = require('../utils/bookingExpiry');

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'DECLINED', 'COMPLETED', 'EXPIRED'];
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

        let whereExtra = ' AND deleted_at IS NULL';
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
            'SELECT * FROM users WHERE user_id = ? AND deleted_at IS NULL',
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
// PATCH /api/admin/users/:id — edit a user's profile details
// Body (all optional): { firstName, lastName, email, phoneNumber,
//                        street, city, province, postalCode }
// Role, password and blocked status are deliberately not editable here.
// ----------------------------------------------------------------
const PROFILE_FIELDS = {
    firstName:   { column: 'first_name',   max: 50  },
    lastName:    { column: 'last_name',    max: 50  },
    email:       { column: 'email',        max: 100 },
    phoneNumber: { column: 'phone_number', max: 25  },
    street:      { column: 'street',       max: 100 },
    city:        { column: 'city',         max: 50  },
    province:    { column: 'province',     max: 20  },
    postalCode:  { column: 'postal_code',  max: 10  },
};

const updateUser = async (req, res) => {
    try {
        const sets = [];
        const params = [];
        let newEmail = null;

        for (const [field, { column, max }] of Object.entries(PROFILE_FIELDS)) {
            if (req.body[field] === undefined) continue;
            const value = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
            if (!value) {
                return res.status(400).json({ message: `${field} cannot be empty.` });
            }
            if (value.length > max) {
                return res.status(400).json({ message: `${field} must be at most ${max} characters.` });
            }
            if (field === 'email') {
                if (!EMAIL_FORMAT.test(value)) {
                    return res.status(400).json({ message: 'email is not a valid email address.' });
                }
                newEmail = value.toLowerCase();
            }
            sets.push(`${column} = ?`);
            params.push(field === 'email' ? newEmail : value);
        }

        if (sets.length === 0) {
            return res.status(400).json({ message: 'No profile fields provided to update.' });
        }

        const [existing] = await pool.execute('SELECT user_id FROM users WHERE user_id = ? AND deleted_at IS NULL', [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (newEmail) {
            const [dupe] = await pool.execute(
                'SELECT user_id FROM users WHERE email = ? AND user_id <> ?',
                [newEmail, req.params.id]
            );
            if (dupe.length > 0) {
                return res.status(409).json({ message: 'Another account already uses this email.' });
            }
        }

        await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, [...params, req.params.id]);

        const [rows] = await pool.execute('SELECT * FROM users WHERE user_id = ?', [req.params.id]);
        return res.json(toAdminUserDTO(rows[0]));
    } catch (err) {
        console.error('Admin updateUser error:', err);
        return res.status(500).json({ message: 'Error updating user.' });
    }
};

// ----------------------------------------------------------------
// GET /api/admin/bookings — paginated list of every booking
// Query params: status, search (booking id, service, provider or requester name), page, limit
// Cancelling goes through PATCH /api/auth/bookings/:id/status, where admins
// are exempt from the cancellation cutoff (canCancel is true for any active booking).
// ----------------------------------------------------------------
const listBookings = async (req, res) => {
    try {
        await expireStalePending();
        const { status, search, page = 1, limit = 20 } = req.query;

        const safePage  = Math.max(1, parseInt(page, 10) || 1);
        const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const offset    = (safePage - 1) * safeLimit;

        let where = '';
        const params = [];

        if (status && BOOKING_STATUSES.includes(status)) {
            where += ' AND b.status = ?';
            params.push(status);
        }
        if (search) {
            const term = `%${search}%`;
            where += ` AND (s.service_name LIKE ?
                        OR CONCAT(prov.first_name, ' ', prov.last_name) LIKE ?
                        OR CONCAT(req.first_name, ' ', req.last_name) LIKE ?
                        OR b.booking_id = ?)`;
            params.push(term, term, term, Number(search) || 0);
        }

        const from = `FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             JOIN users prov ON pd.user_id = prov.user_id
             JOIN users req  ON b.requester_id = req.user_id
             JOIN services s ON b.service_id = s.service_id
             LEFT JOIN users cby ON b.cancelled_by = cby.user_id
             WHERE 1=1 ${where}`;

        const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total ${from}`, params);

        const [rows] = await pool.execute(
            `SELECT b.booking_id, b.status, b.scheduled_date, b.notes, b.booking_date,
                    b.booking_type, b.batch_id, b.session_number, b.sessions_in_batch,
                    b.price, b.discount_percent, b.payment_status, b.decline_reason,
                    b.cancelled_at, b.cancel_reason,
                    CONCAT(cby.first_name, ' ', cby.last_name) AS cancelled_by_name, cby.role AS cancelled_by_role,
                    s.service_name,
                    prov.user_id AS provider_id, prov.first_name AS provider_first_name,
                    prov.last_name AS provider_last_name, prov.city AS provider_city,
                    prov.province AS provider_province,
                    req.user_id AS requester_id, req.first_name AS requester_first_name,
                    req.last_name AS requester_last_name
             ${from}
             ORDER BY b.booking_date DESC, b.booking_id DESC
             LIMIT ${safeLimit} OFFSET ${offset}`,
            params
        );

        const data = toBookingDTOList(rows.map((r) => ({
            ...r,
            can_cancel: ['PENDING', 'CONFIRMED'].includes(r.status), // admins: no cutoff
        })));

        return res.json({ data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) });
    } catch (err) {
        console.error('Admin listBookings error:', err);
        return res.status(500).json({ message: 'Error fetching bookings.' });
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
            'UPDATE users SET is_blocked = ? WHERE user_id = ? AND deleted_at IS NULL',
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
// DELETE /api/admin/users/:id — soft-delete a user
// The row is kept (deleted_at stamped) so bookings and reviews stay as history.
// The user can no longer log in or appear in search/admin lists, and their
// active bookings (as requester or provider) are cancelled and logged.
// ----------------------------------------------------------------
const deleteUser = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const userId = parseInt(req.params.id, 10);
        if (userId === req.user.id) {
            return res.status(400).json({ message: 'Blocking or deleting your own account is not allowed.' });
        }

        const [targetRows] = await conn.execute('SELECT role FROM users WHERE user_id = ? AND deleted_at IS NULL', [userId]);
        if (targetRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (targetRows[0].role === 'ADMIN') {
            return res.status(400).json({ message: 'Blocking or deleting an admin user is not allowed.' });
        }

        await conn.beginTransaction();
        await conn.execute(
            `UPDATE bookings b
             JOIN provider_details pd ON pd.provider_detail_id = b.provider_detail_id
             SET b.status = 'CANCELLED', b.cancelled_by = ?, b.cancelled_at = NOW(),
                 b.cancel_reason = 'Account deleted by admin',
                 b.payment_status = IF(b.payment_status = 'PAID', 'REFUNDED', b.payment_status)
             WHERE b.status IN ('PENDING', 'CONFIRMED') AND (b.requester_id = ? OR pd.user_id = ?)`,
            [req.user.id, userId, userId]
        );
        await conn.execute('UPDATE users SET deleted_at = NOW() WHERE user_id = ?', [userId]);
        await conn.commit();

        return res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('Admin deleteUser error:', err);
        return res.status(500).json({ message: 'Error deleting user.' });
    } finally {
        conn.release();
    }
};

// ----------------------------------------------------------------
// GET /api/admin/stats — dashboard stats
// ----------------------------------------------------------------
const getStats = async (_req, res) => {
    try {
        const [[{ totalUsers }]]     = await pool.execute('SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL');
        const [[{ totalProviders }]] = await pool.execute("SELECT COUNT(*) AS totalProviders FROM users WHERE role = 'PROVIDER' AND deleted_at IS NULL");
        const [[{ totalRequesters }]]= await pool.execute("SELECT COUNT(*) AS totalRequesters FROM users WHERE role = 'REQUESTER' AND deleted_at IS NULL");
        const [[{ totalBookings }]]  = await pool.execute('SELECT COUNT(*) AS totalBookings FROM bookings');
        await expireStalePending();
        const [[{ pendingBookings }]]= await pool.execute("SELECT COUNT(*) AS pendingBookings FROM bookings WHERE status = 'PENDING'");
        const [[{ blockedUsers }]]   = await pool.execute('SELECT COUNT(*) AS blockedUsers FROM users WHERE is_blocked = TRUE AND deleted_at IS NULL');
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

module.exports = { listUsers, getUserById, updateUser, toggleBlock, deleteUser, getStats, listBookings };
