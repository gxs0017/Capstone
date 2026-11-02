// middleware/audit.js
// The audit trail's safety net. Controllers log the important actions with a
// meaningful description themselves; this middleware makes sure NOTHING a signed-in
// person changes slips through:
//   - routes listed in DESCRIBE get a readable entry (what changed, to what),
//   - routes that already log themselves (SELF_LOGGED) are left alone,
//   - any other change (POST/PUT/PATCH/DELETE) is logged generically,
//   - a change that was refused or failed is logged too, so attempts are traceable.
// Passwords, tokens and card data are never written.

const { logAction } = require('../models/AuditLog');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes whose controllers already write their own detailed entries
const SELF_LOGGED = [
    ['POST',   /^\/register$/], ['POST', /^\/login$/],
    ['POST',   /^\/bookings$/], ['PATCH', /^\/bookings\/\d+\/status$/], ['POST', /^\/bookings\/\d+\/issue$/], ['POST', /^\/bookings\/\d+\/report-problem$/],
    ['POST',   /^\/payments\/(create-intent|confirm|demo-pay|withdraw|paypal\/capture)$/],
    ['POST',   /^\/chat\/conversations$/], ['POST', /^\/chat\/conversations\/\d+\/messages$/],
    ['PATCH',  /^\/chat\/conversations\/\d+\/read$/],
    ['POST',   /^\/posts$/], ['PATCH', /^\/posts\/\d+\/close$/], ['POST', /^\/posts\/\d+\/like$/],
    ['POST',   /^\/posts\/\d+\/comments$/], ['DELETE', /^\/posts\/\d+\/comments\/\d+$/],
    ['POST',   /^\/provider\/my-services$/], ['DELETE', /^\/provider\/my-services\/\d+$/], ['PATCH', /^\/provider\/my-services\/\d+\/price$/],
    ['PATCH',  /^\/admin\/users\/\d+(\/block)?$/], ['DELETE', /^\/admin\/users\/\d+$/],
    ['PATCH',  /^\/admin\/chat\/flagged\/\d+$/], ['POST', /^\/admin\/payments\/settle$/],
    ['PATCH',  /^\/admin\/posts\/\d+\/moderate$/], ['DELETE', /^\/admin\/posts\/\d+$/],
    ['PATCH',  /^\/admin\/payouts\/\d+\/paid$/], ['POST', /^\/admin\/bookings\/\d+\/resolve-issue$/],
    ['PATCH',  /^\/notifications/],
    ['POST',   /^\/profile\/become-provider$/],
];

const clip = (v, n = 300) => String(v ?? '').slice(0, n);

// Routes that have no controller-level entry: describe them here
const DESCRIBE = [
    ['PATCH', /^\/profile\/directory$/, 'PROFILE_BIO_UPDATED', (req) => `bio: "${clip(req.body.bio)}"`],
    ['PATCH', /^\/profile\/contact$/, 'CONTACT_PRIVACY_UPDATED', (req) => `show email: ${!!req.body.showEmail}, show phone: ${!!req.body.showPhone}`],
    ['POST',  /^\/provider\/my-availability$/, 'AVAILABILITY_ADDED', (req) => clip(JSON.stringify(req.body))],
    ['DELETE', /^\/provider\/my-availability\/(\d+)$/, 'AVAILABILITY_REMOVED', (_req, m) => `slot: ${m[1]}`],
    ['POST',  /^\/reviews$/, 'REVIEW_SUBMITTED', (req) => `booking: ${req.body.bookingId}, rating: ${req.body.rating}, comment: "${clip(req.body.comment, 400)}"`],
    ['PATCH', /^\/chat\/conversations\/(\d+)\/pin$/, 'CHAT_BOOKING_PINNED', (req, m) => `conversation: ${m[1]}, booking: ${req.body.bookingId ?? 'none'}`],
    ['POST',  /^\/payments\/paypal\/create-order$/, 'PAYPAL_ORDER_CREATED', (req) => `booking: ${req.body.bookingId}`],
];

const matches = (list, method, path) => list.some(([m, re]) => m === method && re.test(path));

const auditTrail = (req, res, next) => {
    if (!MUTATING.has(req.method)) return next();

    res.on('finish', () => {
        try {
            const path = req.path;
            const userId = req.user ? req.user.id : null;
            const ok = res.statusCode < 400;

            if (!ok) {
                // Rate-limit hits are noise; everything else a person tried and failed is worth knowing
                if (res.statusCode === 429 || (!userId && !/^\/(login|register)$/.test(path))) return;
                if (/^\/(login|register)$/.test(path)) {
                    if (path === '/login') {
                        logAction(userId, 'LOGIN_FAILED', `${clip(req.body && req.body.email, 100)} → ${res.statusCode}`, req.ip);
                    }
                    return;
                }
                logAction(userId, 'REQUEST_REFUSED', `${req.method} ${path} → ${res.statusCode}`, req.ip);
                return;
            }

            if (matches(SELF_LOGGED, req.method, path)) return;

            const hit = DESCRIBE.find(([m, re]) => m === req.method && re.test(path));
            if (hit) {
                logAction(userId, hit[2], hit[3](req, path.match(hit[1])), req.ip);
            } else {
                logAction(userId, `${req.method}_${path.split('/').filter(Boolean).slice(0, 2).join('_').toUpperCase().replace(/[^A-Z0-9_]/g, '')}`.slice(0, 50),
                    `${req.method} ${path}`, req.ip);
            }
        } catch (err) {
            console.error('audit middleware failed:', err.message);
        }
    });
    next();
};

module.exports = { auditTrail };
