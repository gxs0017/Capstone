// controllers/availabilityController.js
// Read-only lookup of a provider's weekly availability windows (used by the
// booking calendar), plus provider-owned CRUD so a provider can set their
// own days/time slots (mirrors providerController's my-services pattern).

const Availability = require('../models/Availability');
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

module.exports = { getProviderAvailability, getMyAvailability, addAvailability, removeAvailability };
