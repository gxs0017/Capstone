// controllers/availabilityController.js
// Read-only lookup of a provider's weekly availability windows (used by the
// booking calendar), plus provider-owned CRUD so a provider can set their
// own days/time slots (mirrors providerController's my-services pattern).

const pool = require('../config/db');
const Availability = require('../models/Availability');
const rules = require('../utils/bookingRules');
const slotRules = require('../utils/slots');
const { toAvailabilityDTOList, toAvailabilityDTO } = require('../mappers/userMapper');

const DAY_OF_WEEK_MIN = 0;
const DAY_OF_WEEK_MAX = 6;
const TIME_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

// ----------------------------------------------------------------
// GET /api/auth/providers/:providerId/availability
// Public lookup — any logged-in user can see a provider's availability
// (needed to render the booking calendar before a booking exists).
// ----------------------------------------------------------------
const getProviderAvailability = async (req, res) => {
    try {
        const providerId = Number(req.params.providerId);
        if (!Number.isInteger(providerId)) {
            return res.status(400).json({ message: 'providerId must be a valid number.' });
        }

        const rows = await Availability.getAvailabilityByProviderId(providerId);
        return res.json(toAvailabilityDTOList(rows));
    } catch (err) {
        console.error('getProviderAvailability error:', err);
        return res.status(500).json({ message: 'Error fetching provider availability.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/providers/:providerId/slots?date=YYYY-MM-DD
// Every start time on that date with whether it can be booked (and why not):
// inside the provider's weekly hours, far enough ahead, and not overlapping
// another booking. A provider with no published weekly hours is treated as
// open 8 AM – 8 PM, and `publishedHours: false` tells the UI the provider will
// confirm the requested time. Uses the same rules createBooking enforces.
// ----------------------------------------------------------------
const getProviderSlots = async (req, res) => {
    try {
        const providerId = Number(req.params.providerId);
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.query.date || ''));
        if (!Number.isInteger(providerId) || !match) {
            return res.status(400).json({ message: 'A provider id and a date (YYYY-MM-DD) are required.' });
        }

        const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const date = new Date(y, m - 1, d);
        if (slotRules.dateKey(date) !== match[0]) {
            return res.status(400).json({ message: 'That is not a real calendar date.' });
        }

        const [provider] = await pool.execute(
            "SELECT user_id FROM users WHERE user_id = ? AND role = 'PROVIDER' AND deleted_at IS NULL",
            [providerId]
        );
        if (provider.length === 0) return res.status(404).json({ message: 'Provider not found.' });

        const availabilityRows = await Availability.getAvailabilityByProviderId(providerId);

        // Bookings that could overlap anything on this day (a session straddles the edges)
        const spanMs = rules.SESSION_MINUTES * 60000;
        const dayStart = new Date(y, m - 1, d, 0, 0, 0).getTime();
        const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0).getTime();
        const [booked] = await pool.execute(
            `SELECT b.scheduled_date FROM bookings b
             JOIN provider_details p ON p.provider_detail_id = b.provider_detail_id
             WHERE p.user_id = ? AND b.status IN ('PENDING','CONFIRMED')
               AND b.scheduled_date > ? AND b.scheduled_date < ?`,
            [providerId, rules.formatLocalDateTime(new Date(dayStart - spanMs)), rules.formatLocalDateTime(new Date(dayEnd + spanMs))]
        );

        const horizon = Date.now() + rules.BOOKING_HORIZON_DAYS * 86400000;
        const beyondHorizon = dayStart > horizon;
        const slots = beyondHorizon ? [] : slotRules.slotsForDate(availabilityRows, date, booked.map((r) => r.scheduled_date));

        return res.json({
            date: match[0],
            sessionMinutes: rules.SESSION_MINUTES,
            publishedHours: availabilityRows.length > 0,
            beyondHorizon,
            slots,
        });
    } catch (err) {
        console.error('getProviderSlots error:', err);
        return res.status(500).json({ message: 'Error loading available times.' });
    }
};

// ----------------------------------------------------------------
// GET /api/auth/provider/my-availability — a provider's own slots (PROVIDER only)
// ----------------------------------------------------------------
const getMyAvailability = async (req, res) => {
    try {
        const rows = await Availability.getAvailabilityByProviderId(req.user.id);
        return res.json(toAvailabilityDTOList(rows));
    } catch (err) {
        console.error('getMyAvailability error:', err);
        return res.status(500).json({ message: 'Error fetching your availability.' });
    }
};

// ----------------------------------------------------------------
// POST /api/auth/provider/my-availability — add a weekly slot (PROVIDER only)
// Body: { dayOfWeek: 0-6, startTime: 'HH:mm', endTime: 'HH:mm' }
// ----------------------------------------------------------------
const addAvailability = async (req, res) => {
    try {
        const { dayOfWeek, startTime, endTime } = req.body;
        const day = Number(dayOfWeek);

        if (!Number.isInteger(day) || day < DAY_OF_WEEK_MIN || day > DAY_OF_WEEK_MAX) {
            return res.status(400).json({ message: 'dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday).' });
        }
        if (!TIME_FORMAT.test(startTime || '') || !TIME_FORMAT.test(endTime || '')) {
            return res.status(400).json({ message: 'startTime and endTime must be in "HH:mm" format.' });
        }
        if (startTime >= endTime) {
            return res.status(400).json({ message: 'startTime must be earlier than endTime.' });
        }

        const id = await Availability.addAvailability(req.user.id, day, startTime, endTime);
        return res.status(201).json({
            message: 'Availability added successfully.',
            slot: toAvailabilityDTO({ availability_id: id, day_of_week: day, start_time: startTime, end_time: endTime }),
        });
    } catch (err) {
        console.error('addAvailability error:', err);
        return res.status(500).json({ message: 'Error adding availability.' });
    }
};

// ----------------------------------------------------------------
// DELETE /api/auth/provider/my-availability/:id — remove a slot (PROVIDER only)
// ----------------------------------------------------------------
const removeAvailability = async (req, res) => {
    try {
        const removed = await Availability.removeAvailability(req.user.id, req.params.id);
        if (!removed) {
            return res.status(404).json({ message: 'Availability slot not found.' });
        }
        return res.json({ message: 'Availability slot removed successfully.' });
    } catch (err) {
        console.error('removeAvailability error:', err);
        return res.status(500).json({ message: 'Error removing availability.' });
    }
};

module.exports = { getProviderAvailability, getProviderSlots, getMyAvailability, addAvailability, removeAvailability };
