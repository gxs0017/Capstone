// controllers/bookingController.js
// Booking operations for requesters (create, list, cancel)
// and shared booking queries. Constraints and pricing live in
// utils/bookingRules.js.

const crypto = require('crypto');
const pool = require('../config/db');
const rules = require('../utils/bookingRules');
const { toBookingDTOList } = require('../mappers/userMapper');

// ----------------------------------------------------------------
// GET /api/bookings/quote?serviceId=1&type=ONE_TIME|RECURRING&sessions=4
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

        const [svc] = await pool.execute('SELECT base_price FROM services WHERE service_id = ?', [serviceId]);
        if (svc.length === 0) return res.status(404).json({ message: 'Service not found.' });

        return res.json({
            ...rules.calculateQuote(svc[0].base_price, type, sessions),
            sessionOptions: rules.RECURRING_SESSION_OPTIONS,
            minLeadMinutes: rules.MIN_LEAD_MINUTES,
            cancelCutoffHours: rules.CANCEL_CUTOFF_HOURS,
        });
    } catch (err) {
        console.error('getQuote error:', err);
        return res.status(500).json({ message: 'Error calculating price.' });
    }
};

// Does `date` fall inside one of the provider's weekly availability windows?
const isWithinAvailability = (slots, date) => {
    const time = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    return slots.some((s) => {
        if (s.day_of_week !== date.getDay()) return false;
        const [sh, sm, ss] = String(s.start_time).split(':').map(Number);
        const [eh, em, es] = String(s.end_time).split(':').map(Number);
        return time >= sh * 3600 + sm * 60 + (ss || 0) && time <= eh * 3600 + em * 60 + (es || 0);
    });
};

// ----------------------------------------------------------------
// POST /api/bookings — create a booking (REQUESTER / PROVIDER)
// Body: { providerId, serviceId, scheduledDate?, notes?,
//         bookingType?: 'ONE_TIME' | 'RECURRING', sessions?: 4 | 8 }
// ONE_TIME  -> one PENDING booking, pay on arrival.
// RECURRING -> `sessions` weekly bookings sharing a batch_id, paid upfront
//              at a discount (all-or-nothing).
// Rules: start must be >= 1 hour away, inside the provider's availability,
// and not collide with another active booking for that provider.
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

        // scheduledDate, when provided, must be a MySQL-friendly "YYYY-MM-DD HH:mm:ss"
        // datetime string (what the frontend's date+time picker sends) so it is
        // stored correctly in the DATETIME column.
        const DATETIME_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        if (scheduledDate && !DATETIME_FORMAT.test(scheduledDate)) {
            return res.status(400).json({ message: 'scheduledDate must be in "YYYY-MM-DD HH:mm:ss" format.' });
        }
        if (bookingType === 'RECURRING') {
            if (!scheduledDate) {
                return res.status(400).json({ message: 'A start date and time are required for a recurring booking.' });
            }
            if (!rules.RECURRING_SESSION_OPTIONS.includes(sessions)) {
                return res.status(400).json({ message: `sessions must be one of: ${rules.RECURRING_SESSION_OPTIONS.join(', ')}.` });
            }
        }

        // Find the provider_detail_id that links this provider to this service
        const [pd] = await pool.execute(
            `SELECT pd.provider_detail_id, s.base_price
             FROM provider_details pd JOIN services s ON s.service_id = pd.service_id
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
        let starts = [null];
        if (scheduledDate) {
            const first = rules.parseLocalDateTime(scheduledDate);
            if (isNaN(first.getTime())) {
                return res.status(400).json({ message: 'scheduledDate is not a valid date.' });
            }
            // Rule: no bookings less than an hour before the start time
            if (!rules.meetsLeadTime(first)) {
                return res.status(400).json({
                    message: `Bookings must be made at least ${rules.MIN_LEAD_MINUTES / 60} hour before the start time.`,
                });
            }
            starts = bookingType === 'RECURRING' ? rules.weeklyDates(first, sessions) : [first];

            // Rule: every session must fall in the provider's availability (if they publish any)
            const [slots] = await pool.execute(
                'SELECT day_of_week, start_time, end_time FROM provider_availability WHERE user_id = ?',
                [providerId]
            );
            if (slots.length > 0) {
                const bad = starts.find((d) => !isWithinAvailability(slots, d));
                if (bad) {
                    return res.status(400).json({
                        message: `The provider is not available on ${rules.formatLocalDateTime(bad)}.`,
                    });
                }
            }

            // Rule: no double-booking the provider
            for (const d of starts) {
                const [clash] = await pool.execute(
                    `SELECT b.booking_id FROM bookings b
                     JOIN provider_details p ON p.provider_detail_id = b.provider_detail_id
                     WHERE p.user_id = ? AND b.scheduled_date = ? AND b.status IN ('PENDING','CONFIRMED')`,
                    [providerId, rules.formatLocalDateTime(d)]
                );
                if (clash.length > 0) {
                    return res.status(409).json({
                        message: `The provider already has a booking at ${rules.formatLocalDateTime(d)}.`,
                    });
                }
            }
        }

        const quote = rules.calculateQuote(pd[0].base_price, bookingType, starts.length);
        const batchId = bookingType === 'RECURRING' ? crypto.randomUUID() : null;
        const paymentStatus = bookingType === 'RECURRING' ? 'PAID' : 'UNPAID'; // prepaid pack (mock payment)

        await conn.beginTransaction();
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
                    starts[i] ? rules.formatLocalDateTime(starts[i]) : null,
                    notes || null,
                    bookingType, batchId, i + 1, starts.length,
                    quote.perSessionPrice, quote.discountPercent, paymentStatus,
                ]
            );
            bookingIds.push(result.insertId);
        }
        await conn.commit();

        return res.status(201).json({
            message: 'Booking created successfully.',
            bookingId: bookingIds[0],
            bookingIds,
            batchId,
            status: 'PENDING',
            paymentStatus,
            scheduledDates: starts.filter(Boolean).map(rules.formatLocalDateTime),
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
//  PENDING             -> CONFIRMED / DECLINED  (provider; DECLINED may carry a reason)
//  PENDING / CONFIRMED -> CANCELLED             (requester, provider or admin)
//  CONFIRMED           -> COMPLETED             (either party; triggers the
//                                                requester's review prompt)
// Requesters cannot cancel within CANCEL_CUTOFF_HOURS of the start time.
// A cancelled/declined prepaid session is flagged REFUNDED.
// ----------------------------------------------------------------
const updateBookingStatus = async (req, res) => {
    try {
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
             SET status = ?, decline_reason = ?, payment_status = ?
             WHERE booking_id = ?`,
            [
                status,
                status === 'DECLINED' ? (reason || null) : booking.decline_reason,
                refund ? 'REFUNDED' : booking.payment_status,
                req.params.id,
            ]
        );

        return res.json({
            message: `Booking ${status.toLowerCase()} successfully.`,
            refunded: refund,
        });
    } catch (err) {
        console.error('updateBookingStatus error:', err);
        return res.status(500).json({ message: 'Error updating booking.' });
    }
};

module.exports = { getQuote, createBooking, getMyBookings, updateBookingStatus };
