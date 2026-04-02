// models/User.js
// MySQL query functions replacing the Mongoose model.
// All DB access goes through the pool from config/db.js.

const pool = require('../config/db');

// Find a single user by email (used for login + duplicate check)
const findByEmail = async (email) => {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?', [email]
    );
    return rows[0] || null;
};

// Find a single user by ID
const findById = async (userId) => {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE user_id = ?', [userId]
    );
    return rows[0] || null;
};

// Insert a new user; returns the new user_id
const createUser = async ({ firstName, lastName, phoneNumber, dateOfBirth,
                             email, hashedPassword, street, city, province,
                             postalCode, role }) => {
    const [result] = await pool.execute(
        `INSERT INTO users
         (first_name, last_name, phone_number, date_of_birth,
          email, password, street, city, province, postal_code, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [firstName, lastName, phoneNumber, dateOfBirth,
         email, hashedPassword, street, city, province, postalCode, role]
    );
    return result.insertId;
};

// Look up a service_id by name
const findServiceByName = async (serviceName) => {
    const [rows] = await pool.execute(
        'SELECT service_id FROM services WHERE service_name = ?', [serviceName]
    );
    return rows[0] || null;
};

// Link a provider to a service (INSERT IGNORE avoids duplicate errors)
const addProviderService = async (userId, serviceId) => {
    await pool.execute(
        'INSERT IGNORE INTO provider_details (user_id, service_id) VALUES (?, ?)',
        [userId, serviceId]
    );
};

// Return all providers with their services joined as an array.
// Supports optional filtering by service name and/or city.
const getProviders = async (serviceName, city) => {
    let query = `
        SELECT
            u.user_id    AS id,
            u.first_name AS firstName,
            u.last_name  AS lastName,
            u.email,
            u.city,
            u.province,
            u.role,
                        JSON_ARRAYAGG(s.service_name) AS services
        FROM users u
        JOIN provider_details pd ON u.user_id = pd.user_id
        JOIN services s ON pd.service_id = s.service_id
        WHERE u.role = 'PROVIDER'
    `;
    const params = [];

    if (serviceName) {
        query += ' AND s.service_name = ?';
        params.push(serviceName);
    }
    if (city) {
        query += ' AND u.city LIKE ?';
        params.push(`%${city}%`);
    }

    query += ' GROUP BY u.user_id';

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
        ...row,
        services: typeof row.services === 'string'
            ? JSON.parse(row.services)
            : (row.services || []),
    }));
};

module.exports = { findByEmail, findById, createUser,
                   findServiceByName, addProviderService, getProviders };
