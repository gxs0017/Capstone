// models/User.js
// MySQL query functions replacing the Mongoose model.
// All DB access goes through the pool from config/db.js.

const pool = require('../config/db');

// ── Basic user queries ────────────────────────────────────────────────────────

// Users come back with their neighbourhood name (LEFT JOIN: may be null)
const USER_WITH_AREA = `SELECT u.*, nb.name AS neighbourhood
                        FROM users u LEFT JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id`;

const findByEmail = async (email) => {
    const [rows] = await pool.execute(
        `${USER_WITH_AREA} WHERE u.email = ?`, [email]
    );
    return rows[0] || null;
};

const findById = async (userId) => {
    const [rows] = await pool.execute(
        `${USER_WITH_AREA} WHERE u.user_id = ?`, [userId]
    );
    return rows[0] || null;
};

const createUser = async ({ firstName, lastName, phoneNumber, dateOfBirth,
                             email, hashedPassword, street, city, province,
                             postalCode, role, lat = null, lng = null }) => {
    const [result] = await pool.execute(
        `INSERT INTO users
         (first_name, last_name, phone_number, date_of_birth,
          email, password, street, city, province, postal_code, role, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [firstName, lastName, phoneNumber, dateOfBirth,
         email, hashedPassword, street, city, province, postalCode, role, lat, lng]
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

// Services are open-ended: a provider can add any service name. Names are
// matched case-insensitively (MySQL's default collation), so "plumbing" and
// "Plumbing" are the same tag; a genuinely new name creates a new service.
const findOrCreateService = async (serviceName) => {
    const existing = await findServiceByName(serviceName);
    if (existing) return existing.service_id;
    const [result] = await pool.execute(
        'INSERT INTO services (service_name, base_price) VALUES (?, 25.00)', [serviceName]
    );
    return result.insertId;
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
            u.show_email AS showEmail,
            u.show_phone AS showPhone,
            u.city,
            u.province,
            u.role,
            nb.name AS neighbourhood,
            JSON_ARRAYAGG(s.service_name) AS services,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.provider_id = u.user_id) AS avgRating,
            (SELECT COUNT(*)                 FROM reviews rv WHERE rv.provider_id = u.user_id) AS reviewCount
        FROM users u
        JOIN provider_details pd ON u.user_id = pd.user_id
        JOIN services s ON pd.service_id = s.service_id
        LEFT JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id
        WHERE u.role = 'PROVIDER' AND u.deleted_at IS NULL
        ${whereExtra}
        GROUP BY u.user_id
        ORDER BY ${orderByClause}
        LIMIT ${safeLimit} OFFSET ${offset}
    `;
    const [rows] = await pool.execute(dataQuery, filterParams);

    const data = rows.map(({ showEmail, showPhone, ...row }) => ({
        ...row,
        // Contact details are only exposed when the provider switched them on
        email: showEmail ? row.email : null,
        phoneNumber: showPhone ? row.phoneNumber : null,
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

/** Every service type on the platform (public — powers the search/directory filters and booking). */
const listServices = async () => {
    const [rows] = await pool.execute(
        `SELECT s.service_id, s.service_name, s.base_price,
                (SELECT COUNT(*) FROM provider_details pd WHERE pd.service_id = s.service_id) AS provider_count
         FROM services s ORDER BY s.service_name`
    );
    return rows.map((r) => ({
        serviceId: r.service_id,
        serviceName: r.service_name,
        basePrice: Number(r.base_price),
        providerCount: Number(r.provider_count),
    }));
};

// ── Directory profile (bio + opt-in) ───────────────────────────────────────
// `visible` controls whether a regular neighbour appears in the directory;
// `bio` is the short "about me" shown on directory cards and provider pages.
// Either may be omitted to leave it unchanged.
const updateDirectoryProfile = async (userId, { bio }) => {
    const sets = [];
    const params = [];
    if (bio !== undefined) {
        const clean = bio === null ? null : (String(bio).trim().slice(0, 300) || null);
        sets.push('bio = ?');
        params.push(clean);
    }
    if (sets.length === 0) return false;
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, [...params, userId]);
    return true;
};

// Providers choose whether their email / phone are shown to other people.
// Both default to hidden; the Message and Book buttons always work.
const updateContactPrefs = async (userId, { showEmail, showPhone }) => {
    const sets = [];
    const params = [];
    if (typeof showEmail === 'boolean') { sets.push('show_email = ?'); params.push(showEmail); }
    if (typeof showPhone === 'boolean') { sets.push('show_phone = ?'); params.push(showPhone); }
    if (sets.length === 0) return false;
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ? AND role = 'PROVIDER'`, [...params, userId]);
    return true;
};

// ── Public provider profile (storefront page) ──────────────────────────────
// One provider's basic info + every service they offer with its price.
// avgRating/reviewCount are computed the same way as the search listing.

const getProviderProfile = async (userId) => {
    const [rows] = await pool.execute(
        `SELECT
            u.user_id    AS id,
            u.first_name AS firstName,
            u.last_name  AS lastName,
            u.city,
            u.province,
            u.bio,
            u.created_at AS memberSince,
            (SELECT nb.name FROM neighbourhoods nb WHERE nb.neighbourhood_id = u.neighbourhood_id) AS neighbourhood,
            CASE WHEN u.show_email THEN u.email ELSE NULL END AS email,
            CASE WHEN u.show_phone THEN u.phone_number ELSE NULL END AS phoneNumber,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.provider_id = u.user_id) AS avgRating,
            (SELECT COUNT(*)                 FROM reviews rv WHERE rv.provider_id = u.user_id) AS reviewCount
         FROM users u
         WHERE u.user_id = ? AND u.role = 'PROVIDER' AND u.deleted_at IS NULL`,
        [userId]
    );
    if (rows.length === 0) return null;

    const [services] = await pool.execute(
        `SELECT s.service_id, s.service_name, COALESCE(pd.price, s.base_price) AS price
         FROM provider_details pd
         JOIN services s ON pd.service_id = s.service_id
         WHERE pd.user_id = ?
         ORDER BY s.service_name`,
        [userId]
    );

    return {
        ...rows[0],
        avgRating: rows[0].avgRating !== null ? Number(rows[0].avgRating) : null,
        reviewCount: Number(rows[0].reviewCount) || 0,
        services: services.map((s) => ({
            serviceId: s.service_id,
            serviceName: s.service_name,
            price: Number(s.price),
        })),
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
                   getServicesByUserId, getProviderProfile, updateDirectoryProfile, listServices,
                   findOrCreateService, updateContactPrefs };
