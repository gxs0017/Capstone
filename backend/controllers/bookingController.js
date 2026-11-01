// controllers/bookingController.js
// Booking operations for requesters (create, list, cancel)
// and shared booking queries. Constraints and pricing live in
// utils/bookingRules.js.

const crypto = require('crypto');
const pool = require('../config/db');
const rules = require('../utils/bookingRules');
const slotRules = require('../utils/slots');
const Availability = require('../models/Availability');
const ledger = require('../utils/paymentLedger');
const { expireStalePending } = require('../utils/bookingExpiry');
const { toBookingDTOList } = require('../mappers/userMapper');
const { logAction } = require('../models/AuditLog');
const { notifyBookings } = require('../utils/realtime');

// ----------------------------------------------------------------
// GET /api/bookings/quote?serviceId=1&providerId=2&type=ONE_TIME|RECURRING&sessions=4
// Price breakdown + the booking rules, so the frontend shows exactly
// what the backend will enforce.
// ----------------------------------------------------------------
const getQuote = async (req, res) => {
    try {
        const serviceId = Number(req.query.serviceId);
        const type = req.query.type === 'RECURRING' ? 'RECURRING' : 'ONE_TIME';
        const sessions = type === 'RECURRING'
            ? Number(req.query.sessions) || rules.RECURRING_SESSION_OPTIONS[0]
            : 1;

        if (!Number.isInteger(serviceId) || serviceId <= 0) {
            return res.status(400).json({ message: 'serviceId is required.' });
        }
        if (type === 'RECURRING' && !rules.RECURRING_SESSION_OPTIONS.includes(sessions)) {
            return res.status(400).json({ message: `sessions must be one of: ${rules.RECURRING_SESSION_OPTIONS.join(', ')}.` });
        }

        // A provider's own price for the service wins; otherwise the service's base price.
        const providerId = Number(req.query.providerId) || null;
        const [svc] = await pool.execute(
            `SELECT COALESCE(pd.price, s.base_price) AS base_price
             FROM services s
             LEFT JOIN provider_details pd ON pd.service_id = s.service_id AND pd.user_id = ?
             WHERE s.service_id = ?`,
            [providerId, serviceId]
        );
        if (svc.length === 0) return res.status(404).json({ message: 'Service not found.' });

        return res.json({
            ...rules.calculateQuote(svc[0].base_price, type, sessions),
            sessionOptions: rules.RECURRING_SESSION_OPTIONS,
            minLeadMinutes: rules.MIN_LEAD_MINUTES,
            cancelCutoffHours: rules.CANCEL_CUTOFF_HOURS,
            pendingExpiryHours: rules.PENDING_EXPIRY_HOURS,
            sessionMinutes: rules.SESSION_MINUTES,
            horizonDays: rules.BOOKING_HORIZON_DAYS,
        });
    } catch (err) {
        console.error('getQuote error:', err);
        return res.status(500).json({ message: 'Error calculating price.' });
    }
};

const SLOT_ERRORS = {
    CLOSED:   (when) => ({ status: 400, message: `The provider is not available at ${when}. Pick a time from their open slots.` }),
    TOO_SOON: ()     => ({ status: 400, message: `Bookings must be made at least ${rules.MIN_LEAD_MINUTES / 60} hour before the start time.` }),
    TOO_FAR:  ()     => ({ status: 400, message: `Bookings can only be made up to ${rules.BOOKING_HORIZON_DAYS} days ahead.` }),
    BOOKED:   (when) => ({ status: 409, message: `The provider already has a booking that overlaps ${when}. Pick another time.` }),
};

// ----------------------------------------------------------------
// POST /api/bookings — create a booking (REQUESTER / PROVIDER)
// Body: { providerId, serviceId, scheduledDate, notes?,
//         bookingType?: 'ONE_TIME' | 'RECURRING', sessions?: 4 | 8 }
// scheduledDate ("YYYY-MM-DD HH:mm:ss") is REQUIRED — a booking always has a time.
// ONE_TIME  -> one PENDING booking; pay on arrival or online (held until completion).
// RECURRING -> `sessions` weekly bookings sharing a batch_id at a discount
//              (all-or-nothing); the whole pack is paid online in one payment.
// Rules (see utils/slots.js): the session must fit the provider's weekly hours,
// start >= 1 hour from now, and not overlap another active booking.
// ----------------------------------------------------------------
const createBooking = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { providerId, serviceId, scheduledDate, notes } = req.body;
        const bookingType = req.body.bookingType === 'RECURRING' ? 'RECURRING' : 'ONE_TIME';
        const sessions = bookingType === 'RECURRING' ? Number(req.body.sessions) : 1;

        if (!providerId || !serviceId) {
            return res.status(400).json({ message: 'providerId and serviceId are required.' });
        }

        // A booking always has a time. scheduledDate must be a MySQL-friendly
        // "YYYY-MM-DD HH:mm:ss" datetime string (what the booking page's date +
        // time-slot picker sends) so it is stored correctly in the DATETIME column.
        const DATETIME_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        if (!scheduledDate) {
            return res.status(400).json({ message: 'Pick a date and time for the booking.' });
        }
        if (!DATETIME_FORMAT.test(scheduledDate)) {
            return res.status(400).json({ message: 'scheduledDate must be in "YYYY-MM-DD HH:mm:ss" format.' });
        }
        if (bookingType === 'RECURRING' && !rules.RECURRING_SESSION_OPTIONS.includes(sessions)) {
            return res.status(400).json({ message: `sessions must be one of: ${rules.RECURRING_SESSION_OPTIONS.join(', ')}.` });
        }

        // Find the provider_detail_id that links this provider to this service
        const [pd] = await pool.execute(
            `SELECT pd.provider_detail_id, COALESCE(pd.price, s.base_price) AS base_price
             FROM provider_details pd
             JOIN services s ON s.service_id = pd.service_id
             JOIN users u ON u.user_id = pd.user_id AND u.deleted_at IS NULL
             WHERE pd.user_id = ? AND pd.service_id = ?`,
            [providerId, serviceId]
        );
        if (pd.length === 0) {
            return res.status(404).json({
                message: 'This provider does not offer the requested service.',
            });
        }

        // Don't let users book themselves
        if (providerId === req.user.id) {
            return res.status(400).json({ message: 'You cannot book your own service.' });
        }

        // Every session start the booking will occupy
        const first = rules.parseLocalDateTime(scheduledDate);
        if (isNaN(first.getTime())) {
            return res.status(400).json({ message: 'scheduledDate is not a valid date.' });
        }
        const starts = bookingType === 'RECURRING' ? rules.weeklyDates(first, sessions) : [first];

        const quote = rules.calculateQuote(pd[0].base_price, bookingType, starts.length);
        const batchId = bookingType === 'RECURRING' ? crypto.randomUUID() : null;
        // Nothing is "paid" until a real payment goes through (utils/paymentLedger.js).
        const paymentStatus = 'UNPAID';

        await conn.beginTransaction();

        // Serialize bookings per provider: lock their rows so two requesters
        // picking the same slot at the same moment can't both pass the check below.
        await conn.execute('SELECT provider_detail_id FROM provider_details WHERE user_id = ? FOR UPDATE', [providerId]);

        const availabilityRows = await Availability.getAvailabilityByProviderId(providerId);
        const spanMs = rules.SESSION_MINUTES * 60000;
        for (const d of starts) {
            const [clashRows] = await conn.execute(
                `SELECT b.scheduled_date FROM bookings b
                 JOIN provider_details p ON p.provider_detail_id = b.provider_detail_id
                 WHERE p.user_id = ? AND b.status IN ('PENDING','CONFIRMED')
                   AND b.scheduled_date > ? AND b.scheduled_date < ?`,
                [providerId, rules.formatLocalDateTime(new Date(d.getTime() - spanMs)),
                             rules.formatLocalDateTime(new Date(d.getTime() + spanMs))]
            );
            const check = slotRules.checkStart(availabilityRows, d, clashRows.map((r) => r.scheduled_date));
            if (!check.ok) {
                await conn.rollback();
                const err = SLOT_ERRORS[check.code](rules.formatLocalDateTime(d));
                return res.status(err.status).json({ message: err.message });
            }
        }

        const bookingIds = [];
        for (let i = 0; i < starts.length; i++) {
            const [result] = await conn.execute(
                `INSERT INTO bookings
                    (provider_detail_id, requester_id, service_id, scheduled_date, notes,
                     booking_type, batch_id, session_number, sessions_in_batch,
                     price, discount_percent, payment_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pd[0].provider_detail_id, req.user.id, serviceId,
                    rules.formatLocalDateTime(starts[i]),
                    notes || null,
                    bookingType, batchId, i + 1, starts.length,
                    quote.perSessionPrice, quote.discountPercent, paymentStatus,
                ]
            );
            bookingIds.push(result.insertId);
        }
        await conn.commit();

        logAction(req.user.id, 'BOOKING_CREATED', 'booking: ' + bookingIds.join(','), req.ip);
        notifyBookings(bookingIds, 'created', req.user.id);

        return res.status(201).json({
            message: 'Booking created successfully.',
            bookingId: bookingIds[0],
            bookingIds,
            batchId,
            status: 'PENDING',
            paymentStatus,
            scheduledDates: starts.map(rules.formatLocalDateTime),
            quote,
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('createBooking error:', err);
        return res.status(500).json({ message: 'Error creating booking.' });
    } finally {
        conn.release();
    }
};

// ----------------------------------------------------------------
// GET /api/bookings/my — list bookings for the current user
// Works for both REQUESTER (their bookings) and PROVIDER (bookings of their services)
// ----------------------------------------------------------------
const getMyBookings = async (req, res) => {
    try {
        await expireStalePending();
        const userId = req.user.id;
        const role   = req.user.role;
        const view   = req.query.view; // 'requests' = incoming (provider view), default = outgoing (requester view)

        let whereClause;
        if (view === 'requests' && role === 'PROVIDER') {
            // Provider wants to see incoming requests
            whereClause = 'pd.user_id = ?';
        } else {
            // Default: show bookings where user is the requester
            whereClause = 'b.requester_id = ?';
        }

        const [rows] = await pool.execute(
            `SELECT
                b.booking_id,
                b.status,
                b.payment_method,
                b.amount,
                b.stripe_payment_intent_id,
                b.scheduled_date,
                b.notes,
                b.booking_date,
                b.booking_type,
                b.batch_id,
                b.session_number,
                b.sessions_in_batch,
                b.price,
                b.discount_percent,
                b.payment_status,
                b.decline_reason,
                s.service_name,
                prov.user_id   AS provider_id,
                prov.first_name AS provider_first_name,
                prov.last_name  AS provider_last_name,
                prov.city       AS provider_city,
                prov.province   AS provider_province,
                req.user_id    AS requester_id,
                req.first_name AS requester_first_name,
                req.last_name  AS requester_last_name,
                r.review_id    AS review_id,
                r.rating       AS review_rating,
                r.comment      AS review_comment
             FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             JOIN users prov ON pd.user_id = prov.user_id
             JOIN users req  ON b.requester_id = req.user_id
             JOIN services s ON b.service_id = s.service_id
             LEFT JOIN reviews r ON r.booking_id = b.booking_id
             WHERE ${whereClause}
             ORDER BY b.booking_date DESC, b.batch_id, b.session_number`,
            [userId]
        );

        // Tell the UI whether the cancel button should work for THIS viewer.
        // Requesters are bound by the cancellation cutoff; providers can always cancel.
        const now = new Date();
        const withFlags = rows.map((r) => {
            const active = ['PENDING', 'CONFIRMED'].includes(r.status);
            const viewerIsRequester = r.requester_id === userId && r.provider_id !== userId;
            return {
                ...r,
                can_cancel: active && (!viewerIsRequester || rules.withinCancelWindow(r.scheduled_date, now)),
                cancel_deadline: r.scheduled_date ? rules.cancelDeadline(new Date(r.scheduled_date)) : null,
            };
        });

        return res.json(toBookingDTOList(withFlags));
    } catch (err) {
        console.error('getMyBookings error:', err);
        return res.status(500).json({ message: 'Error fetching bookings.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/bookings/:id/status — update booking status
// Body: { status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED', reason? }
// A cancellation is logged on the booking row: cancelled_by, cancelled_at, cancel_reason.
//  PENDING             -> CONFIRMED / DECLINED  (provider; DECLINED may carry a reason)
//  PENDING             -> EXPIRED               (automatic, see utils/bookingExpiry.js)
//  PENDING / CONFIRMED -> CANCELLED             (requester, provider or admin)
//  CONFIRMED           -> COMPLETED             (either party; triggers the
//                                                requester's review prompt)
// Requesters cannot cancel within CANCEL_CUTOFF_HOURS of the start time;
// providers and admins can cancel any active booking right up to the last minute.
// A cancelled/declined prepaid session is flagged REFUNDED.
// ----------------------------------------------------------------
const updateBookingStatus = async (req, res) => {
    try {
        await expireStalePending(); // a request past its deadline can no longer be accepted
        const { status } = req.body;
        const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 255) : '';
        if (!['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'].includes(status)) {
            return res.status(400).json({ message: 'Status must be CONFIRMED, DECLINED, CANCELLED, or COMPLETED.' });
        }

        // Get the booking and check ownership
        const [bookings] = await pool.execute(
            `SELECT b.*, pd.user_id AS provider_user_id
             FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             WHERE b.booking_id = ?`,
            [req.params.id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const booking = bookings[0];
        const isProvider  = booking.provider_user_id === req.user.id;
        const isRequester = booking.requester_id === req.user.id;
        const isAdmin     = req.user.role === 'ADMIN';

        if (!isProvider && !isRequester && !isAdmin) {
            return res.status(403).json({ message: 'You are not authorized to update this booking.' });
        }

        // Only the provider (or admin) decides on a request
        if (['CONFIRMED', 'DECLINED'].includes(status) && !isProvider && !isAdmin) {
            return res.status(403).json({ message: 'Only the provider can confirm or decline a request.' });
        }

        // Valid transitions
        if (['CONFIRMED', 'DECLINED'].includes(status) && booking.status !== 'PENDING') {
            return res.status(400).json({ message: 'Only a pending request can be confirmed or declined.' });
        }
        if (status === 'CANCELLED' && !['PENDING', 'CONFIRMED'].includes(booking.status)) {
            return res.status(400).json({ message: `A ${booking.status.toLowerCase()} booking cannot be cancelled.` });
        }
        if (status === 'COMPLETED' && booking.status !== 'CONFIRMED') {
            return res.status(400).json({ message: 'Only a confirmed booking can be marked completed.' });
        }
        // The money for a paid booking is held until the job is done. Only the
        // person who paid (or an admin) can say it's done — otherwise a provider
        // could release their own payment.
        if (status === 'COMPLETED' && booking.payment_status === 'PAID' && !isRequester && !isAdmin) {
            return res.status(403).json({
                message: 'This booking was paid online. Only the person who paid can confirm it is complete — ask them to mark it done.',
            });
        }

        // Cancellation cutoff (requester only; providers and admins are exempt)
        if (status === 'CANCELLED' && isRequester && !isProvider && !isAdmin
            && !rules.withinCancelWindow(booking.scheduled_date)) {
            return res.status(400).json({
                message: `Bookings cannot be cancelled within ${rules.CANCEL_CUTOFF_HOURS} hours of the start time.`,
            });
        }

        const refund = ['CANCELLED', 'DECLINED'].includes(status) && booking.payment_status === 'PAID';
        await pool.execute(
            `UPDATE bookings
             SET status = ?, decline_reason = ?, payment_status = ?,
                 cancelled_by = ?, cancelled_at = ${status === 'CANCELLED' ? 'NOW()' : 'cancelled_at'}, cancel_reason = ?
             WHERE booking_id = ?`,
            [
                status,
                status === 'DECLINED' ? (reason || null) : booking.decline_reason,
                refund ? 'REFUNDED' : booking.payment_status,
                status === 'CANCELLED' ? req.user.id : booking.cancelled_by,
                status === 'CANCELLED' ? (reason || null) : booking.cancel_reason,
                req.params.id,
            ]
        );

        logAction(req.user.id, 'BOOKING_' + status, 'booking: ' + req.params.id, req.ip);
        notifyBookings(req.params.id, status.toLowerCase(), req.user.id);

        // Release the provider's earnings (completed) or return the money
        // through the original gateway (cancelled / declined). Fire-and-forget:
        // a gateway hiccup must never block the status change, and failed refunds retry.
        if (refund || status === 'COMPLETED') ledger.settle();

        return res.json({
            message: `Booking ${status.toLowerCase()} successfully.`,
            refunded: refund,
        });
    } catch (err) {
        console.error('updateBookingStatus error:', err);
        return res.status(500).json({ message: 'Error updating booking.' });
    }
};

// ----------------------------------------------------------------
// GET /bookings/:id — single booking detail (requester, provider, or admin)
// Used by the chat "pinned booking" context panel so it always shows the
// current state of that one booking, fetched fresh rather than cached.
// ----------------------------------------------------------------
const getBookingById = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT b.booking_id, b.status, b.payment_method, b.amount, b.stripe_payment_intent_id,
                    b.scheduled_date, b.notes, b.booking_date, b.booking_type, b.batch_id,
                    b.session_number, b.sessions_in_batch, b.price, b.discount_percent,
                    b.payment_status, b.decline_reason, b.cancelled_at, b.cancel_reason,
                    CONCAT(cby.first_name, ' ', cby.last_name) AS cancelled_by_name, cby.role AS cancelled_by_role,
                    s.service_name,
                    prov.user_id   AS provider_id, prov.first_name AS provider_first_name,
                    prov.last_name AS provider_last_name, prov.city AS provider_city, prov.province AS provider_province,
                    req.user_id    AS requester_id, req.first_name AS requester_first_name, req.last_name AS requester_last_name,
                    r.review_id    AS review_id, r.rating AS review_rating, r.comment AS review_comment
             FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             JOIN users prov ON pd.user_id = prov.user_id
             JOIN users req  ON b.requester_id = req.user_id
             JOIN services s ON b.service_id = s.service_id
             LEFT JOIN reviews r ON r.booking_id = b.booking_id
             LEFT JOIN users cby ON b.cancelled_by = cby.user_id
             WHERE b.booking_id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const booking = rows[0];
        const isRequester = booking.requester_id === req.user.id;
        const isProvider  = booking.provider_id === req.user.id;
        const isAdmin     = req.user.role === 'ADMIN';

        if (!isRequester && !isProvider && !isAdmin) {
            return res.status(403).json({ message: 'You do not have access to this booking.' });
        }

        return res.json(toBookingDTOList([booking])[0]);
    } catch (err) {
        console.error('getBookingById error:', err);
        return res.status(500).json({ message: 'Error fetching booking.' });
    }
};

module.exports = { getQuote, createBooking, getMyBookings, updateBookingStatus, getBookingById };
