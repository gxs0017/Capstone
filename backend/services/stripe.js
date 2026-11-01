// services/stripe.js
// Lazily-created Stripe client so the API still boots when Stripe isn't
// configured. Controllers call `stripeService.getStripe()` through this module
// object (not a destructured copy) so tests can swap in a stub.
const Stripe = require('stripe');

let client = null;

const isConfigured = () => !!process.env.STRIPE_SECRET_KEY;

const getStripe = () => {
    if (!isConfigured()) {
        const err = new Error('STRIPE_SECRET_KEY is not set.');
        err.code = 'STRIPE_NOT_CONFIGURED';
        throw err;
    }
    return (client ||= new Stripe(process.env.STRIPE_SECRET_KEY));
};

module.exports = { getStripe, isConfigured };
