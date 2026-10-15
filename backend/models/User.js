// models/User.js
// MySQL query functions replacing the Mongoose model.
// All DB access goes through the pool from config/db.js.

const pool = require('../config/db');

// ── Basic user queries ────────────────────────────────────────────────────────

const findByEmail = async (email) => {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?', [email]
    );
    return rows[0] || null;
};

const findById = async (userId) => {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE user_id = ?', [userId]
    );
    return rows[0] || null;
};

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

// ── Service helpers ───────────────────────────────────────────────────────────

const findServiceByName = async (serviceName) => {
    const [rows] = await pool.execute(
        'SELECT service_id FROM services WHERE service_name = ?', [serviceName]
    );
    return rows[0] || null;
};

const addProviderService = async (userId, serviceId, price = null) => {
    await pool.execute(
        'INSERT IGNORE INTO provider_details (user_id, service_id, price) VALUES (?, ?, ?)',
        [userId, serviceId, price]
    );
};

const updateProviderServicePrice = async (userId, serviceId, price) => {
    const [result] = await pool.execute(
        'UPDATE provider_details SET price = ? WHERE user_id = ? AND service_id = ?',
        [price, userId, serviceId]
    );
    return result.affectedRows;
};

// ── Provider search with filtering, sorting, and pagination ───────────────────
//
// Returns:
//   { data: Provider[], total: number, page: number, limit: number, totalPages: number }
//
// Query params (all optional):
//   serviceName  – filter by exact service name
//   city         – filter by city substring
//   sort         – 'avgRating' | 'first_name' | 'city' | 'created_at'  (default: 'avgRating')
//   order        – 'ASC' | 'DESC'                                      (default: 'DESC')
//   page         – 1-indexed page number                               (default: 1)
//   limit        – results per page, max 50                            (default: 6)

const getProviders = async (
    serviceName,
    city,
    sort  = 'avgRating',
    order = 'DESC',
    page  = 1,
    limit = 6
) => {
    // ── Security: whitelist sort column and order ─────────────────────────────
    // 'avgRating' is a derived column (subquery below), not a real users column,
    // so it's handled separately from the plain u.<column> sorts.
    const ALLOWED_SORT_COLUMNS = ['avgRating', 'first_name', 'city', 'created_at'];
    const ALLOWED_ORDERS       = ['ASC', 'DESC'];

    const safeSortColumn = ALLOWED_SORT_COLUMNS.includes(sort)           ? sort           : 'avgRating';
    const safeOrder      = ALLOWED_ORDERS.includes(order.toUpperCase())  ? order.toUpperCase() : 'DESC';
    // Providers with no reviews (NULL avgRating) always sort to the bottom,
    // regardless of ASC/DESC, so a 5-star provider always outranks an unrated one.
    const orderByClause  = safeSortColumn === 'avgRating'
        ? `avgRating IS NULL ASC, avgRating ${safeOrder}`
        : `u.${safeSortColumn} ${safeOrder}`;

    // ── Sanitise pagination values ────────────────────────────────────────────
    const safePage  = Math.max(1, parseInt(page,  10) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 6));
    const offset    = (safePage - 1) * safeLimit;

    // ── Build shared WHERE conditions and params ───────────────────────────────
    // Both the COUNT query and the data query use the same filters.
    let whereExtra = '';
    const filterParams = [];

    if (serviceName) {
        whereExtra += ' AND s.service_name = ?';
        filterParams.push(serviceName);
    }
    if (city) {
        whereExtra += ' AND u.city LIKE ?';
        filterParams.push(`%${city}%`);
    }

    // ── COUNT query — how many distinct providers match the filters ───────────
    const countQuery = `
        SELECT COUNT(DISTINCT u.user_id) AS total
        FROM users u
        JOIN provider_details pd ON u.user_id = pd.user_id
        JOIN services s ON pd.service_id = s.service_id
        WHERE u.role = 'PROVIDER' AND u.deleted_at IS NULL
        ${whereExtra}
    `;
    const [[{ total }]] = await pool.execute(countQuery, filterParams);

    // ── Data query — paginated, sorted ───────────────────────────────────────
    // LIMIT and OFFSET must be integers; pool.execute() with placeholders
    // sometimes coerces them to strings, so we interpolate them directly
    // after validating they are safe integers above.
    const dataQuery = `
        SELECT
            u.user_id    AS id,
            u.first_name AS firstName,
            u.last_name  AS lastName,
            u.email,
            u.phone_number AS phoneNumber,
            u.city,
            u.province,
            u.role,
            JSON_ARRAYAGG(s.service_name) AS services,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.provider_id = u.user_id) AS avgRating,
            (SELECT COUNT(*)                 FROM reviews rv WHERE rv.provider_id = u.user_id) AS reviewCount
        FROM users u
        JOIN provider_details pd ON u.user_id = pd.user_id
        JOIN services s ON pd.service_id = s.service_id
        WHERE u.role = 'PROVIDER' AND u.deleted_at IS NULL
        ${whereExtra}
        GROUP BY u.user_id
        ORDER BY ${orderByClause}
        LIMIT ${safeLimit} OFFSET ${offset}
    `;
    const [rows] = await pool.execute(dataQuery, filterParams);

    const data = rows.map(row => ({
        ...row,
        services: typeof row.services === 'string'
            ? JSON.parse(row.services)
            : (row.services || []),
        avgRating: row.avgRating !== null ? Number(row.avgRating) : null,
        reviewCount: Number(row.reviewCount) || 0,
    }));

    return {
        data,
        total,
        page:       safePage,
        limit:      safeLimit,
        totalPages: Math.ceil(total / safeLimit),
    };
};

// ── Get service names for a given user ───────────────────────────────────────

const getServicesByUserId = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT s.service_name
         FROM provider_details pd
         JOIN services s ON pd.service_id = s.service_id
         WHERE pd.user_id = ?
         ORDER BY s.service_name`,
        [userId]
    );
    return rows.map(r => r.service_name);
};

module.exports = { findByEmail, findById, createUser,
                   findServiceByName, addProviderService, updateProviderServicePrice, getProviders,
                   getServicesByUserId };
