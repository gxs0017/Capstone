/* middleware/rateLimit.js
 Rate limiting to protect against abuse and brute-force attacks. */
const rateLimit = require('express-rate-limit');

// General limiter ( applies to the whole API. )
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // max requests per IP per window 
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
});

// Strict limiter for auth endpoints (brute-force protection): 5 attempts / 5 minutes.
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,  // 5 minutes
    max: 5, // max attempts per IP 
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

// Chat message sending: generous enough for real conversation, tight enough
// to blunt a scripted spam burst. 30 messages / minute / IP.
const messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'You are sending messages too quickly. Please slow down.' },
});

// Community Board: comments flow like conversation, new posts shouldn't.
const commentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'You are commenting too quickly. Please slow down.' },
});

const postLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'You have posted a lot recently. Please try again in a few minutes.' },
});

// Address lookups come from people typing; the geocoder itself is throttled too.
const geoLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many address searches. Please wait a moment.' },
});

module.exports = { globalLimiter, authLimiter, messageLimiter, commentLimiter, postLimiter, geoLimiter };
