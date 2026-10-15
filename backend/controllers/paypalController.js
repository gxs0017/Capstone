// controllers/paypalController.js
// PayPal payment flow for bookings. Isolated from other payment work.
// The charge amount is ALWAYS computed server-side from the provider's price
// (never trusted from the client).
const pool = require('../config/db');
const paypal = require('../services/paypal');

// Fetch a booking plus the provider's price for its service.
async function getBooking(bookingId) {
    const [rows] = await pool.execute(
        `SELECT b.booking_id, b.requester_id, b.payment_status, b.paypal_order_id, pd.price
         FROM bookings b
         JOIN provider_details pd ON b.provider_detail_id = pd.provider_detail_id
         WHERE b.booking_id = ?`,
        [bookingId]
    );
    return rows[0] || null;
}

// POST /payments/paypal/create-order   body: { bookingId }
const createOrder = async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) return res.status(400).json({ message: 'bookingId is required.' });

        const booking = await getBooking(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });
        if (booking.requester_id !== req.user.id) return res.status(403).json({ message: 'This is not your booking.' });
        if (booking.payment_status === 'PAID') return res.status(400).json({ message: 'This booking is already paid.' });
        if (booking.price == null) return res.status(400).json({ message: 'This service has no price set.' });

        const amount = Number(booking.price);
        const order = await paypal.createOrder(amount);

        await pool.execute(
            "UPDATE bookings SET paypal_order_id = ?, amount = ?, payment_method = 'paypal' WHERE booking_id = ?",
            [order.id, amount, bookingId]
        );
        return res.json({ orderId: order.id, amount });
    } catch (err) {
        console.error('paypal createOrder error:', err);
        return res.status(500).json({ message: 'Could not start PayPal payment.' });
    }
};

// POST /payments/paypal/capture   body: { bookingId }
const capture = async (req, res) => {
    const { bookingId } = req.body;
    try {
        if (!bookingId) return res.status(400).json({ message: 'bookingId is required.' });

        const booking = await getBooking(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });
        if (booking.requester_id !== req.user.id) return res.status(403).json({ message: 'This is not your booking.' });
        if (!booking.paypal_order_id) return res.status(400).json({ message: 'No PayPal order to capture.' });

        const result = await paypal.captureOrder(booking.paypal_order_id);
        const captureId = result && result.purchase_units && result.purchase_units[0]
            && result.purchase_units[0].payments && result.purchase_units[0].payments.captures
            && result.purchase_units[0].payments.captures[0]
            ? result.purchase_units[0].payments.captures[0].id : null;

        if (result.status === 'COMPLETED') {
            await pool.execute(
                "UPDATE bookings SET payment_status = 'PAID', paypal_capture_id = ? WHERE booking_id = ?",
                [captureId, bookingId]
            );
            return res.json({ message: 'Payment successful.', status: 'PAID' });
        }

        await pool.execute("UPDATE bookings SET payment_status = 'FAILED' WHERE booking_id = ?", [bookingId]);
        return res.status(402).json({ message: 'Payment was not completed.', status: result.status });
    } catch (err) {
        console.error('paypal capture error:', err);
        try { await pool.execute("UPDATE bookings SET payment_status = 'FAILED' WHERE booking_id = ?", [bookingId]); } catch (_) {}
        return res.status(500).json({ message: 'Payment capture failed.' });
    }
};

// GET /payments/paypal/config   -> public client id for the frontend button
const config = (_req, res) => {
    return res.json({ clientId: process.env.PAYPAL_CLIENT_ID || '', mode: paypal.PAYPAL_MODE });
};

module.exports = { createOrder, capture, config };
