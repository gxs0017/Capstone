// Originally created by Broinson Jeyarajah (Student Number: 991568803) — Stripe card payments.
// References: https://docs.stripe.com/api/payment_intents/create , /retrieve , https://docs.stripe.com/metadata
//
// controllers/paymentController.js
// Payment endpoints shared by both gateways: what a payment will cost and cover,
// Stripe card payments, a user's payment history / earnings, and the admin
// overview. The amount is ALWAYS derived from the stored booking price by
// utils/paymentLedger.js — never from anything the client sends.

const pool = require('../config/db');
const ledger = require('../utils/paymentLedger');
const stripeService = require('../services/stripe');
const paypal = require('../services/paypal');
const Payment = require('../models/Payment');
const { PaymentDTO, PayoutDTO } = require('../dtos/PaymentDTO');
const { notify } = require('../utils/notify');
const { emitToUser } = require('../config/socket');
const { logAction } = require('../models/AuditLog');

/** Maps a PaymentError to its HTTP status; anything else is a 500. */
const respondError = (res, err, fallback) => {
    if (err instanceof ledger.PaymentError) {
        return res.status(err.status).json({ message: err.message, code: err.code });
    }
    console.error(fallback, err);
    return res.status(500).json({ message: fallback });
};

// Demo card: a stand-in for a card gateway while no Stripe secret key is set, for trying the whole
// flow (escrow, 7-day hold, payouts) without a real charge. Needs PAYMENTS_DEMO=on and switches itself
// off the moment real Stripe keys exist.
const demoEnabled = () => process.env.PAYMENTS_DEMO === 'on' && !stripeService.isConfigured();

const availableMethods = () => ({ paypal: paypal.isConfigured(), stripe: stripeService.isConfigured(), demo: demoEnabled() });

// ----------------------------------------------------------------
// GET /payments/methods — which online payment methods are switched on
// ----------------------------------------------------------------
const getMethods = (_req, res) => res.json({ ...availableMethods(), currency: ledger.CURRENCY });

// ----------------------------------------------------------------
// GET /payments/summary/:bookingId — exactly what paying this booking covers
// (one session, or every unpaid session of a weekly pack) and what it costs.
// ----------------------------------------------------------------
const getSummary = async (req, res) => {
    try {
        const group = await ledger.getPayableGroup(Number(req.params.bookingId), req.user.id);
        const p = group.primary;
        return res.json({
            bookingIds: group.ids,
            sessions: group.bookings.length,
            recurring: p.booking_type === 'RECURRING',
            total: group.total,
            currency: group.currency,
            service: p.service_name,
            provider: { id: p.provider_id, name: `${p.provider_first} ${p.provider_last}` },
            scheduledDates: group.bookings.map((b) => b.scheduled_date),
            methods: availableMethods(),
        });
    } catch (err) {
        return respondError(res, err, 'Error loading payment details.');
    }
};

// ----------------------------------------------------------------
// POST /payments/demo-pay — pay with the demo card (no real money moves)
// Body: { bookingId }
// ----------------------------------------------------------------
const demoPay = async (req, res) => {
    try {
        if (!demoEnabled()) return res.status(503).json({ message: 'The demo card is not available.' });
        const group = await ledger.getPayableGroup(Number(req.body.bookingId), req.user.id);
        await ledger.recordPaymentSuccess({ group, payerId: req.user.id, method: 'demo', externalRef: `demo_${Date.now()}` });
        logAction(req.user.id, 'PAYMENT_CONFIRMED', `booking: ${group.ids.join(',')}, method: demo card, total: $${group.total.toFixed(2)}`, req.ip);
        return res.json({ message: 'Demo payment recorded.', paymentStatus: 'PAID' });
    } catch (err) {
        return respondError(res, err, 'Error recording the demo payment.');
    }
};

// ----------------------------------------------------------------
// POST /payments/create-intent — Stripe PaymentIntent for a booking (or its pack)
// Body: { bookingId }
// ----------------------------------------------------------------
const createPaymentIntent = async (req, res) => {
    try {
        if (!stripeService.isConfigured()) {
            return res.status(503).json({ message: 'Card payments are not available right now.' });
        }
        const group = await ledger.getPayableGroup(Number(req.body.bookingId), req.user.id);

        const amount = ledger.toCents(group.total);
        if (!Number.isInteger(amount) || amount < 50) {
            return res.status(400).json({ message: 'Card payments need a total of at least $0.50.' });
        }

        const paymentIntent = await stripeService.getStripe().paymentIntents.create({
            amount,
            currency: ledger.CURRENCY.toLowerCase(),
            payment_method_types: ['card'],
            description: `Booking payment #${group.primary.booking_id}`,
            // Bound to this booking + requester so confirmPayment can verify it later
            metadata: {
                bookingId: String(group.primary.booking_id),
                requesterId: String(req.user.id),
                bookingIds: group.ids.join(','),
            },
        });

        logAction(req.user.id, 'PAYMENT_INTENT_CREATED', 'booking: ' + group.ids.join(','), req.ip);

        return res.status(201).json({
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        });
    } catch (err) {
        return respondError(res, err, 'Error creating payment intent.');
    }
};

// ----------------------------------------------------------------
// POST /payments/confirm — verify a Stripe payment and record it
// Body: { bookingId, paymentIntentId }
// ----------------------------------------------------------------
const confirmPayment = async (req, res) => {
    try {
        const { bookingId, paymentIntentId } = req.body;
        if (!bookingId || !paymentIntentId) {
            return res.status(400).json({ message: 'Booking ID and payment intent ID are required.' });
        }
        if (!stripeService.isConfigured()) {
            return res.status(503).json({ message: 'Card payments are not available right now.' });
        }

        const intent = await stripeService.getStripe().paymentIntents.retrieve(paymentIntentId);

        // The intent must be the one we created for THIS booking and THIS user
        if (intent.metadata.bookingId !== String(bookingId) || intent.metadata.requesterId !== String(req.user.id)) {
            return res.status(403).json({ message: 'Payment not matched with this specific booking.' });
        }
        if (intent.status !== 'succeeded') {
            return res.status(400).json({ message: 'Payment has not been completed.' });
        }

        let group;
        try {
            group = await ledger.getPayableGroup(Number(bookingId), req.user.id);
        } catch (err) {
            if (err.code === 'ALREADY_PAID') {
                // A retried confirmation for a payment we've already recorded is a success, not an error
                const [rows] = await pool.execute(
                    `SELECT 1 FROM bookings WHERE booking_id = ? AND stripe_payment_intent_id = ? AND payment_status = 'PAID'`,
                    [bookingId, intent.id]
                );
                if (rows.length > 0) return res.json({ message: 'Payment already confirmed.', paymentStatus: 'PAID' });
            }
            throw err;
        }

        // What Stripe actually charged must equal what this booking costs
        if (intent.amount !== ledger.toCents(group.total) || intent.currency !== ledger.CURRENCY.toLowerCase()) {
            logAction(req.user.id, 'PAYMENT_AMOUNT_MISMATCH', `booking: ${bookingId}, intent: ${intent.id}`, req.ip);
            return res.status(409).json({ message: "The amount paid doesn't match this booking's total. Please contact support." });
        }

        await ledger.recordPaymentSuccess({ group, payerId: req.user.id, method: 'stripe', externalRef: intent.id });
        logAction(req.user.id, 'PAYMENT_CONFIRMED', `booking: ${group.ids.join(',')}, method: stripe`, req.ip);

        return res.json({ message: 'Payment confirmed successfully.', paymentStatus: 'PAID' });
    } catch (err) {
        return respondError(res, err, 'Error confirming payment.');
    }
};

// ----------------------------------------------------------------
// GET /payments/mine — what the current user has paid and (if a provider) earned
// ----------------------------------------------------------------
const getMyPayments = async (req, res) => {
    try {
        const { paid, earned, balance, payouts } = await Payment.getForUser(req.user.id);
        return res.json({
            currency: ledger.CURRENCY,
            holdDays: ledger.holdDays(),
            balance,
            payouts: payouts.map(PayoutDTO),
            paid:   { totals: paid.totals,   entries: paid.entries.map((r) => PaymentDTO(r)) },
            earned: { totals: earned.totals, entries: earned.entries.map((r) => PaymentDTO(r)) },
        });
    } catch (err) {
        return respondError(res, err, 'Error loading payments.');
    }
};

// ----------------------------------------------------------------
// GET /admin/payments — platform-wide ledger overview (ADMIN)
// ----------------------------------------------------------------
const getAdminOverview = async (_req, res) => {
    try {
        const { totals, entries } = await Payment.getOverview();
        const payouts = await Payment.listAllPayouts();
        return res.json({ currency: ledger.CURRENCY, totals, entries: entries.map((r) => PaymentDTO(r, { admin: true })), payouts: payouts.map(PayoutDTO) });
    } catch (err) {
        return respondError(res, err, 'Error loading the payments overview.');
    }
};

// ----------------------------------------------------------------
// POST /admin/payments/settle — release completed payments and retry failed refunds (ADMIN)
// ----------------------------------------------------------------
const settleNow = async (req, res) => {
    try {
        const result = await ledger.settle();
        logAction(req.user.id, 'PAYMENTS_SETTLED', JSON.stringify(result), req.ip);
        return res.json({ message: 'Payments settled.', result });
    } catch (err) {
        return respondError(res, err, 'Error settling payments.');
    }
};

// ----------------------------------------------------------------
// POST /payments/withdraw — provider withdraws everything past its 7-day hold
// ----------------------------------------------------------------
const withdraw = async (req, res) => {
    try {
        if (req.user.role !== 'PROVIDER') return res.status(403).json({ message: 'Only service providers have earnings to withdraw.' });
        const payout = await ledger.withdrawAvailable(req.user.id);
        if (!payout) {
            const balance = await Payment.balanceFor(req.user.id);
            return res.status(400).json({
                message: balance.pending > 0
                    ? `Nothing to withdraw yet — your earnings clear ${ledger.holdDays()} days after the job is credited.`
                    : 'There is nothing available to withdraw.',
            });
        }
        logAction(req.user.id, 'PAYOUT_REQUESTED', `payout: ${payout.payoutId}, amount: $${payout.amount.toFixed(2)}, payments: ${payout.payments}`, req.ip);
        notify(req.user.id, { type: 'PAYOUT_REQUESTED', title: 'Withdrawal requested', body: `Your withdrawal of $${payout.amount.toFixed(2)} was requested and is being processed.`, link: '/wallet' });
        emitToUser(req.user.id, 'booking:changed', { reason: 'payout', actorId: req.user.id });
        return res.status(201).json({ message: `Withdrawal of $${payout.amount.toFixed(2)} requested.`, ...payout });
    } catch (err) {
        return respondError(res, err, 'Error requesting the withdrawal.');
    }
};

// ----------------------------------------------------------------
// PATCH /admin/payouts/:id/paid — admin marks a payout as sent (ADMIN)
// ----------------------------------------------------------------
const markPayoutPaid = async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM payouts WHERE payout_id = ? AND status = 'REQUESTED'", [req.params.id]);
        const payout = rows[0];
        if (!payout) return res.status(404).json({ message: 'No pending payout with that id.' });
        await pool.execute("UPDATE payouts SET status = 'PAID', paid_at = NOW() WHERE payout_id = ?", [payout.payout_id]);
        logAction(req.user.id, 'PAYOUT_PAID', `payout: ${payout.payout_id}, provider: ${payout.provider_id}, amount: $${Number(payout.amount).toFixed(2)}`, req.ip);
        notify(payout.provider_id, { type: 'PAYOUT_PAID', title: 'Withdrawal sent', body: `Your withdrawal of $${Number(payout.amount).toFixed(2)} has been sent.`, link: '/wallet' });
        emitToUser(payout.provider_id, 'booking:changed', { reason: 'payout', actorId: req.user.id });
        return res.json({ message: 'Payout marked as paid.' });
    } catch (err) {
        return respondError(res, err, 'Error updating the payout.');
    }
};

module.exports = { demoPay, withdraw, markPayoutPaid, getMethods, getSummary, createPaymentIntent, confirmPayment, getMyPayments, getAdminOverview, settleNow, respondError };
