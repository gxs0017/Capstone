// middleware/rateLimit.js
// Rate limiting to protect against abuse and brute-force attacks.
const rateLimit = require('express-rate-limit');

// General limiter — applies to the whole API.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,                 // max requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
});

// Strict limiter for auth endpoints (brute-force protection): 5 attempts / 5 minutes.
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,  // 5 minutes
    max: 5,                   // max attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

module.exports = { globalLimiter, authLimiter };
