// controllers/paypalController.js
// PayPal payment flow for bookings. The charge amount is ALWAYS computed
// server-side (utils/paymentLedger.js) from the stored booking price — a weekly
// pack is one order covering every unpaid session — and the amount PayPal
// actually captured is verified against it before anything is marked PAID.
const pool = require('../config/db');
const paypal = require('../services/paypal');
const ledger = require('../utils/paymentLedger');
const { logAction } = require('../models/AuditLog');
const { respondError } = require('./paymentController');

// POST /payments/paypal/create-order   body: { bookingId }
const createOrder = async (req, res) => {
    try {
        if (!paypal.isConfigured()) {
            return res.status(503).json({ message: 'PayPal is not available right now.' });
        }
        const group = await ledger.getPayableGroup(Number(req.body.bookingId), req.user.id);

        const order = await paypal.createOrder(group.total, ledger.CURRENCY);
        await pool.query('UPDATE bookings SET paypal_order_id = ? WHERE booking_id IN (?)', [order.id, group.ids]);

        return res.json({ orderId: order.id, amount: group.total, sessions: group.bookings.length, currency: ledger.CURRENCY });
    } catch (err) {
        return respondError(res, err, 'Could not start PayPal payment.');
    }
};

// POST /payments/paypal/capture   body: { bookingId }
const capture = async (req, res) => {
    let group = null;
    try {
        try {
            group = await ledger.getPayableGroup(Number(req.body.bookingId), req.user.id);
        } catch (err) {
            // A retried capture for something we've already recorded is a success
            if (err.code === 'ALREADY_PAID') return res.json({ message: 'Payment successful.', status: 'PAID' });
            throw err;
        }

        const [[row]] = await pool.execute(
            'SELECT paypal_order_id FROM bookings WHERE booking_id = ?', [group.primary.booking_id]
        );
        if (!row || !row.paypal_order_id) {
            return res.status(400).json({ message: 'No PayPal order to capture.' });
        }

        let result;
        try {
            result = await paypal.captureOrder(row.paypal_order_id);
        } catch (err) {
            // Captured on a previous attempt whose response we never recorded — recover it
            if (/ORDER_ALREADY_CAPTURED/.test(err.message)) result = await paypal.getOrder(row.paypal_order_id);
            else throw err;
        }

        const captured = result && result.purchase_units && result.purchase_units[0]
            && result.purchase_units[0].payments && result.purchase_units[0].payments.captures
            && result.purchase_units[0].payments.captures[0];

        if (!result || result.status !== 'COMPLETED' || !captured) {
            await ledger.markFailed(group.ids);
            return res.status(402).json({ message: 'Payment was not completed.', status: result && result.status });
        }

        // What PayPal captured must equal what this booking costs
        if (Math.abs(Number(captured.amount.value) - group.total) > 0.005 || captured.amount.currency_code !== ledger.CURRENCY) {
            logAction(req.user.id, 'PAYMENT_AMOUNT_MISMATCH', `booking: ${group.ids.join(',')}, capture: ${captured.id}`, req.ip);
            return res.status(409).json({ message: "The amount paid doesn't match this booking's total. Please contact support." });
        }

        await ledger.recordPaymentSuccess({ group, payerId: req.user.id, method: 'paypal', externalRef: captured.id });
        logAction(req.user.id, 'PAYMENT_CONFIRMED', `booking: ${group.ids.join(',')}, method: paypal`, req.ip);

        return res.json({ message: 'Payment successful.', status: 'PAID' });
    } catch (err) {
        if (!(err instanceof ledger.PaymentError) && group) {
            try { await ledger.markFailed(group.ids); } catch (_) {}
        }
        return respondError(res, err, 'Payment capture failed.');
    }
};

// GET /payments/paypal/config   -> public client id + currency for the frontend button
const config = (_req, res) => {
    return res.json({ clientId: process.env.PAYPAL_CLIENT_ID || '', mode: paypal.PAYPAL_MODE, currency: ledger.CURRENCY });
};

module.exports = { createOrder, capture, config };
