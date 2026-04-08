// middleware/roles.js
// Role-based access control middleware.
// Use AFTER authMiddleware so req.user is already populated with { id, email, role }.
//
// Usage:
//   router.get('/admin/users', authMiddleware, requireRole('ADMIN'), handler);
//   router.post('/bookings',   authMiddleware, requireRole('REQUESTER', 'ADMIN'), handler);

const pool = require('../config/db');

/**
 * Restrict access to one or more roles.
 * Accepts a spread of role strings: requireRole('ADMIN') or requireRole('PROVIDER', 'ADMIN')
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: 'Authentication required.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
            });
        }

        next();
    };
};

/**
 * Check if the authenticated user's account is blocked.
 * Use after authMiddleware. Blocked users get a 403 on every protected request.
 */
const checkBlocked = async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            'SELECT is_blocked FROM users WHERE user_id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Account not found.' });
        }

        if (rows[0].is_blocked) {
            return res.status(403).json({
                message: 'Your account has been restricted by an administrator.',
            });
        }

        next();
    } catch (err) {
        console.error('checkBlocked error:', err);
        return res.status(500).json({ message: 'Server error checking account status.' });
    }
};

module.exports = { requireRole, checkBlocked };
