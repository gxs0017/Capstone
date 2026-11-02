// dtos/PaymentDTO.js
// Ledger row as shown to the people involved. `refundError` is only included
// for admins (the gateway's raw error text isn't for end users).

const PaymentDTO = (row, { admin = false } = {}) => ({
    paymentId:      row.payment_id,
    bookingId:      row.booking_id,
    service:        row.service_name,
    scheduledDate:  row.scheduled_date,
    bookingStatus:  row.booking_status,
    method:         row.method,
    status:         row.status,
    currency:       row.currency,
    amount:         Number(row.amount),
    platformFee:    Number(row.platform_fee),
    providerAmount: Number(row.provider_amount),
    createdAt:      row.created_at,
    releasedAt:     row.released_at,
    refundedAt:     row.refunded_at,
    availableAt:    row.available_at ?? null,
    payoutId:       row.payout_id ?? null,
    payer:    { id: row.payer_id,    name: `${row.payer_first} ${row.payer_last}` },
    provider: { id: row.provider_id, name: `${row.provider_first} ${row.provider_last}` },
    ...(admin ? { refundError: row.refund_error } : {}),
});

const PayoutDTO = (row) => ({
    payoutId:    row.payout_id,
    amount:      Number(row.amount),
    currency:    row.currency,
    status:      row.status,
    requestedAt: row.requested_at,
    paidAt:      row.paid_at,
    ...(row.provider_name ? { provider: { id: row.provider_id, name: row.provider_name, email: row.provider_email } } : {}),
});

module.exports = { PaymentDTO, PayoutDTO };
