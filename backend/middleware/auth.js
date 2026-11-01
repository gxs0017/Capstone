// middleware/auth.js
// Verifies the JWT sent in the Authorization header.
// Usage: add authMiddleware to any route that requires login.
// router.get('/protected', authMiddleware, handler)

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided. Please log in.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, email, role, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

// For public pages that look slightly different when you're signed in (e.g. the
// board marks posts you've liked). A missing or bad token is simply treated as
// "not signed in" — it never rejects the request.
authMiddleware.optional = (req, _res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        } catch (_) { /* treat as anonymous */ }
    }
    next();
};

module.exports = authMiddleware;
