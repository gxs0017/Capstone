// services/paypal.js
// Thin PayPal REST client (Orders API v2). No SDK — uses built-in fetch.
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// Exchange client id + secret for a short-lived access token.
async function getAccessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('PayPal credentials missing (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env).');
  }
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${data.error_description || res.status}`);
  return data.access_token;
}

// Create an order for a given amount (immediate capture intent).
async function createOrder(amount, currency = 'USD') {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: currency, value: Number(amount).toFixed(2) } }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal createOrder failed: ${JSON.stringify(data)}`);
  return data;
}

// Capture a previously approved order.
async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal captureOrder failed: ${JSON.stringify(data)}`);
  return data;
}

module.exports = { getAccessToken, createOrder, captureOrder, PAYPAL_MODE };
