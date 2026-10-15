// utils/bookingRules.js
// Single source of truth for booking constraints and pricing.
// The frontend reads these through GET /bookings/quote so the numbers
// shown to the user always match what the backend enforces.

const MIN_LEAD_MINUTES        = 60;      // cannot book less than 1 hour before start
const CANCEL_CUTOFF_HOURS     = 24;      // requesters cannot cancel inside 24h of start (admins are exempt)
const PENDING_EXPIRY_HOURS    = 24;      // a request the provider hasn't accepted in this long expires
const RECURRING_DISCOUNT_PCT  = 10;      // prepaid weekly pack discount vs one-time
const RECURRING_SESSION_OPTIONS = [4, 8]; // pack sizes offered

const MS_MIN  = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;

// "YYYY-MM-DD HH:mm:ss" (local time, as sent by the frontend) -> Date
const parseLocalDateTime = (str) => new Date(str.replace(' ', 'T'));

// Date -> "YYYY-MM-DD HH:mm:ss" in local time (for MySQL DATETIME)
const formatLocalDateTime = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
           `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Price breakdown for a one-time booking or a recurring pack. */
const calculateQuote = (basePrice, bookingType, sessions = 1) => {
    const base = Number(basePrice);
    if (bookingType === 'RECURRING') {
        const perSession = round2(base * (1 - RECURRING_DISCOUNT_PCT / 100));
        return {
            bookingType,
            sessions,
            basePrice: base,
            discountPercent: RECURRING_DISCOUNT_PCT,
            perSessionPrice: perSession,
            total: round2(perSession * sessions),
            fullPriceTotal: round2(base * sessions),
            savings: round2((base - perSession) * sessions),
        };
    }
    return {
        bookingType: 'ONE_TIME',
        sessions: 1,
        basePrice: base,
        discountPercent: 0,
        perSessionPrice: base,
        total: base,
        fullPriceTotal: base,
        savings: 0,
    };
};

/** True when the start time is at least MIN_LEAD_MINUTES from now. */
const meetsLeadTime = (start, now = new Date()) =>
    start.getTime() - now.getTime() >= MIN_LEAD_MINUTES * MS_MIN;

/** Latest moment a requester may cancel a booking that starts at `start`. */
const cancelDeadline = (start) => new Date(start.getTime() - CANCEL_CUTOFF_HOURS * MS_HOUR);

/** True when a requester may still cancel (no start time = nothing to enforce). */
const withinCancelWindow = (start, now = new Date()) =>
    !start || now.getTime() <= cancelDeadline(new Date(start)).getTime();

/** The weekly repeat dates of a recurring pack, starting at `start`. */
const weeklyDates = (start, sessions) =>
    Array.from({ length: sessions }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7); // calendar days, so the wall-clock time survives DST
        return d;
    });

module.exports = {
    MIN_LEAD_MINUTES,
    CANCEL_CUTOFF_HOURS,
    PENDING_EXPIRY_HOURS,
    RECURRING_DISCOUNT_PCT,
    RECURRING_SESSION_OPTIONS,
    parseLocalDateTime,
    formatLocalDateTime,
    calculateQuote,
    meetsLeadTime,
    cancelDeadline,
    withinCancelWindow,
    weeklyDates,
};
