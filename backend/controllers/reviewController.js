// controllers/reviewController.js
// Review operations — a requester rates a COMPLETED booking once,
// and either side can look up reviews for a provider.

const pool = require('../config/db');
const { toReviewDTO, toReviewDTOList } = require('../mappers/userMapper');

// ----------------------------------------------------------------
// POST /api/reviews — submit a review for a completed booking (REQUESTER only)
// Body: { bookingId, rating, comment? }
// ----------------------------------------------------------------
const submitReview = async (req, res) => {
    try {
        const { bookingId, rating, comment } = req.body;

        if (!bookingId || rating === undefined || rating === null) {
            return res.status(400).json({ message: 'bookingId and rating are required.' });
        }

        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'rating must be an integer between 1 and 5.' });
        }

        const [bookings] = await pool.execute(
            `SELECT b.booking_id, b.status, b.requester_id, pd.user_id AS provider_id
             FROM bookings b
             JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
             WHERE b.booking_id = ?`,
            [bookingId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: 'Booking not found.' });
        }

        const booking = bookings[0];

        if (booking.requester_id !== req.user.id) {
            return res.status(403).json({ message: 'You can only review your own bookings.' });
        }

        if (booking.status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Only a completed booking can be reviewed.' });
        }

        const [existing] = await pool.execute(
            'SELECT review_id FROM reviews WHERE booking_id = ?',
            [bookingId]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'This booking has already been reviewed.' });
        }

        const [result] = await pool.execute(
            `INSERT INTO reviews (booking_id, requester_id, provider_id, rating, comment)
             VALUES (?, ?, ?, ?, ?)`,
            [bookingId, req.user.id, booking.provider_id, numericRating, comment || null]
        );

        return res.status(201).json({
            message: 'Review submitted successfully.',
            reviewId: result.insertId,
        });
    } catch (err) {
        console.error('submitReview error:', err);
        return res.status(500).json({ message: 'Error submitting review.' });
    }
};

// ----------------------------------------------------------------
// GET /api/reviews/provider/:providerId — reviews + average rating for a provider
// ----------------------------------------------------------------
const getReviewsForProvider = async (req, res) => {
    try {
        const providerId = req.params.providerId;

        const [rows] = await pool.execute(
            `SELECT r.review_id, r.booking_id, r.rating, r.comment, r.created_at,
                    req.user_id AS requester_id, req.first_name AS requester_first_name,
                    req.last_name AS requester_last_name
             FROM reviews r
             JOIN users req ON r.requester_id = req.user_id
             WHERE r.provider_id = ?
             ORDER BY r.created_at DESC`,
            [providerId]
        );

        const avgRating = rows.length
            ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length
            : null;

        return res.json({
            providerId: Number(providerId),
            avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
            reviewCount: rows.length,
            reviews: toReviewDTOList(rows),
        });
    } catch (err) {
        console.error('getReviewsForProvider error:', err);
        return res.status(500).json({ message: 'Error fetching reviews.' });
    }
};

module.exports = { submitReview, getReviewsForProvider };
