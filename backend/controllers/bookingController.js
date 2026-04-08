// controllers/bookingController.js
// Booking operations for requesters (create, list, cancel)
// and shared booking queries.

const pool = require('../config/db');
const { toBookingDTOList } = require('../mappers/userMapper');

// ----------------------------------------------------------------
// POST /api/bookings — create a new booking (REQUESTER only)
// Body: { providerId, serviceId, scheduledDate?, notes? }
// ----------------------------------------------------------------
const createBooking = async (req, res) => {
    try {
        const { providerId, serviceId, scheduledDate, notes } = req.body;

        if (!providerId || !serviceId) {
            return res.status(400).json({ message: 'providerId and serviceId are required.' });
        }

        // Find the provider_detail_id that links this provider to this service
        const [pd] = await pool.execute(
            'SELECT provider_detail_id FROM provider_details WHERE user_id = ? AND service_id = ?',
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

        const [result] = await pool.execute(
            `INSERT INTO bookings (provider_detail_id, requester_id, service_id, scheduled_date, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [pd[0].provider_detail_id, req.user.id, serviceId, scheduledDate || null, notes || null]
        );

        return res.status(201).json({
            message: 'Booking created successfully.',
            bookingId: result.insertId,
            status: 'PENDING',
        });
    } catch (err) {
        console.error('createBooking error:', err);
        return res.status(500).json({ message: 'Error creating booking.' });
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
                s.service_name,
                prov.user_id   AS provider_id,
                prov.first_name AS provider_first_name,
                prov.last_name  AS provider_last_name,
                prov.city       AS provider_city,
                prov.province   AS provider_province,
                req.user_id    AS requester_id,
                req.first_name AS requester_first_name,
                req.last_name  AS requester_last_name
             FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             JOIN users prov ON pd.user_id = prov.user_id
             JOIN users req  ON b.requester_id = req.user_id
             JOIN services s ON b.service_id = s.service_id
             WHERE ${whereClause}
             ORDER BY b.booking_date DESC`,
            [userId]
        );

        return res.json(toBookingDTOList(rows));
    } catch (err) {
        console.error('getMyBookings error:', err);
        return res.status(500).json({ message: 'Error fetching bookings.' });
    }
};

// ----------------------------------------------------------------
// PATCH /api/bookings/:id/status — update booking status
// Body: { status: 'CONFIRMED' | 'CANCELLED' }
// Provider can CONFIRM or CANCEL; Requester can CANCEL their own.
// ----------------------------------------------------------------
const updateBookingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['CONFIRMED', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Status must be CONFIRMED or CANCELLED.' });
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

        // Requesters can only cancel
        if (isRequester && status !== 'CANCELLED') {
            return res.status(403).json({ message: 'You can only cancel your own bookings.' });
        }

        await pool.execute(
            'UPDATE bookings SET status = ? WHERE booking_id = ?',
            [status, req.params.id]
        );

        return res.json({ message: `Booking ${status.toLowerCase()} successfully.` });
    } catch (err) {
        console.error('updateBookingStatus error:', err);
        return res.status(500).json({ message: 'Error updating booking.' });
    }
};

module.exports = { createBooking, getMyBookings, updateBookingStatus };
