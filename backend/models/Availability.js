// models/Availability.js
// Read access to a provider's recurring weekly availability windows.
// Backs the booking page's calendar (which dates/times are selectable).

const pool = require('../config/db');

const getAvailabilityByProviderId = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT availability_id, user_id, day_of_week, start_time, end_time
         FROM provider_availability
         WHERE user_id = ?
         ORDER BY day_of_week, start_time`,
        [userId]
    );
    return rows;
};

const addAvailability = async (userId, dayOfWeek, startTime, endTime) => {
    const [result] = await pool.execute(
        `INSERT INTO provider_availability (user_id, day_of_week, start_time, end_time)
         VALUES (?, ?, ?, ?)`,
        [userId, dayOfWeek, startTime, endTime]
    );
    return result.insertId;
};

const removeAvailability = async (userId, availabilityId) => {
    const [result] = await pool.execute(
        'DELETE FROM provider_availability WHERE availability_id = ? AND user_id = ?',
        [availabilityId, userId]
    );
    return result.affectedRows > 0;
};

module.exports = { getAvailabilityByProviderId, addAvailability, removeAvailability };
