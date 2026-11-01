// utils/slots.js
// Single source of truth for "which start times can be booked". Used both by
// GET /providers/:id/slots (what the booking page shows) and by
// createBooking (what the server accepts), so the two can never disagree.
//
// A booking reserves SESSION_MINUTES starting at its scheduled time. A start
// time is bookable when:
//   1. the whole session fits inside one of the provider's weekly windows for
//      that weekday (or inside the default hours if they've published none),
//   2. it is at least MIN_LEAD_MINUTES from now and within the booking horizon,
//   3. it doesn't overlap another PENDING/CONFIRMED booking for that provider.

const rules = require('./bookingRules');

const pad = (n) => String(n).padStart(2, '0');
const toMinutes = (time) => {
    const [h, m] = String(time).split(':').map(Number);
    return h * 60 + (m || 0);
};
const toHHmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** 'YYYY-MM-DD' for a local Date. */
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Weekly windows (in minutes since midnight) that apply to a weekday. */
const windowsForDay = (availabilityRows, dayOfWeek) => {
    if (availabilityRows.length === 0) {
        return [{ start: rules.DEFAULT_OPEN_MINUTES, end: rules.DEFAULT_CLOSE_MINUTES }];
    }
    return availabilityRows
        .filter((r) => Number(r.day_of_week) === dayOfWeek)
        .map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }));
};

/** Does a session starting at `startMinutes` fit entirely inside one window? */
const fitsWindow = (windows, startMinutes) =>
    windows.some((w) => startMinutes >= w.start && startMinutes + rules.SESSION_MINUTES <= w.end);

/** Does `start` (a Date) collide with any booking in `bookedStarts` (Dates)? */
const overlapsBooking = (start, bookedStarts) => {
    const span = rules.SESSION_MINUTES * 60000;
    return bookedStarts.some((b) => Math.abs(new Date(b).getTime() - start.getTime()) < span);
};

/**
 * Every candidate start on `date` with whether it's bookable and, if not, why.
 * @returns {{ time: string, available: boolean, reason?: 'TOO_SOON'|'BOOKED' }[]}
 */
const slotsForDate = (availabilityRows, date, bookedStarts, now = new Date()) => {
    const windows = windowsForDay(availabilityRows, date.getDay());
    const starts = new Set();
    for (const w of windows) {
        for (let m = w.start; m + rules.SESSION_MINUTES <= w.end; m += rules.SLOT_STEP_MINUTES) {
            starts.add(m);
        }
    }

    return [...starts].sort((a, b) => a - b).map((m) => {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(m / 60), m % 60, 0, 0);
        if (!rules.meetsLeadTime(start, now)) return { time: toHHmm(m), available: false, reason: 'TOO_SOON' };
        if (overlapsBooking(start, bookedStarts)) return { time: toHHmm(m), available: false, reason: 'BOOKED' };
        return { time: toHHmm(m), available: true };
    });
};

/**
 * Server-side check used by createBooking for each session start.
 * @returns {{ ok: true } | { ok: false, code: 'CLOSED'|'TOO_SOON'|'TOO_FAR'|'BOOKED' }}
 */
const checkStart = (availabilityRows, start, bookedStarts, now = new Date()) => {
    const windows = windowsForDay(availabilityRows, start.getDay());
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    if (!fitsWindow(windows, startMinutes)) return { ok: false, code: 'CLOSED' };
    if (!rules.meetsLeadTime(start, now)) return { ok: false, code: 'TOO_SOON' };
    const horizon = now.getTime() + rules.BOOKING_HORIZON_DAYS * 86400000;
    if (start.getTime() > horizon) return { ok: false, code: 'TOO_FAR' };
    if (overlapsBooking(start, bookedStarts)) return { ok: false, code: 'BOOKED' };
    return { ok: true };
};

module.exports = { dateKey, toHHmm, windowsForDay, fitsWindow, overlapsBooking, slotsForDate, checkStart };
