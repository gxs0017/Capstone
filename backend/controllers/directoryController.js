// controllers/directoryController.js
// The neighbourhood directory ("yellow pages") and the "Recommended near you"
// list. Both list SERVICE PROVIDERS only — requesters are never listed, and no
// entry ever carries an email, phone number or street address (contact
// details live behind the provider's own privacy switches on their storefront).

const pool = require('../config/db');
const { toDirectoryDTOList } = require('../mappers/directoryMapper');

// Where is the viewer? Signed-in users: their saved neighbourhood/city/province.
// Anonymous visitors can pass ?city= and are matched on city only.
const viewerPlace = async (req) => {
    const place = { neighbourhoodId: 0, city: (req.query.city || '').trim(), province: '', neighbourhood: null };
    if (req.user) {
        const [rows] = await pool.execute(
            `SELECT u.city, u.province, u.neighbourhood_id, nb.name AS neighbourhood
             FROM users u LEFT JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id
             WHERE u.user_id = ? AND u.deleted_at IS NULL`, [req.user.id]
        );
        if (rows[0]) {
            place.city = rows[0].city || place.city;
            place.province = rows[0].province || '';
            place.neighbourhoodId = rows[0].neighbourhood_id || 0;
            place.neighbourhood = rows[0].neighbourhood || null;
        }
    }
    return place;
};

// 0 = same neighbourhood, 1 = same city, 2 = same province, 3 = elsewhere
const PROXIMITY_SQL = `
    CASE
        WHEN ? > 0 AND u.neighbourhood_id = ? THEN 0
        WHEN ? <> '' AND LOWER(u.city) = LOWER(?) THEN 1
        WHEN ? <> '' AND u.province = ? THEN 2
        ELSE 3
    END`;
const proximityParams = (p) => [p.neighbourhoodId, p.neighbourhoodId, p.city, p.city, p.province, p.province];

// Only providers who actually offer something, and never blocked/deleted ones.
const BASE_WHERE = [
    "u.role = 'PROVIDER'", 'u.deleted_at IS NULL', 'u.is_blocked = FALSE',
    'EXISTS (SELECT 1 FROM provider_details d0 WHERE d0.user_id = u.user_id)',
];

const SELECT_COLUMNS = `
    u.user_id AS id, u.first_name, u.last_name, u.role, u.city, u.province, u.bio, u.created_at,
    nb.name AS neighbourhood,
    (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.provider_id = u.user_id) AS avgRating,
    (SELECT COUNT(*) FROM reviews rv WHERE rv.provider_id = u.user_id) AS reviewCount,
    (SELECT COUNT(*) FROM bookings b JOIN provider_details pd2 ON pd2.provider_detail_id = b.provider_detail_id
      WHERE pd2.user_id = u.user_id AND b.status = 'COMPLETED') AS completedJobs,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('name', s.service_name, 'price', COALESCE(d.price, s.base_price)))
       FROM provider_details d JOIN services s ON s.service_id = d.service_id
      WHERE d.user_id = u.user_id) AS services`;

// ----------------------------------------------------------------
// GET /directory?search=&service=&city=&page=&limit=
// Ranking: same neighbourhood, then same city, then same province, then the
// rest; within a tier, best-rated first.
// ----------------------------------------------------------------
const getDirectory = async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const service = (req.query.service || '').trim();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(24, Math.max(1, parseInt(req.query.limit, 10) || 12));
        const offset = (page - 1) * limit;
        const place = await viewerPlace(req);

        const where = [...BASE_WHERE];
        const whereParams = [];
        if (req.user) {
            where.push('u.user_id <> ?');
            whereParams.push(req.user.id);
        }
        if (search) {
            where.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
                         OR u.bio LIKE ? OR u.city LIKE ? OR nb.name LIKE ?
                         OR EXISTS (SELECT 1 FROM provider_details d JOIN services s ON s.service_id = d.service_id
                                    WHERE d.user_id = u.user_id AND s.service_name LIKE ?))`);
            const term = `%${search}%`;
            whereParams.push(term, term, term, term, term, term, term);
        }
        if (service) {
            where.push(`EXISTS (SELECT 1 FROM provider_details d JOIN services s ON s.service_id = d.service_id
                                WHERE d.user_id = u.user_id AND s.service_name = ?)`);
            whereParams.push(service);
        }

        const from = 'FROM users u LEFT JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id';
        const whereSql = `WHERE ${where.join(' AND ')}`;
        const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total ${from} ${whereSql}`, whereParams);

        const [rows] = await pool.execute(
            `SELECT ${SELECT_COLUMNS}, ${PROXIMITY_SQL} AS proximity
             ${from} ${whereSql}
             ORDER BY proximity ASC, (avgRating IS NULL) ASC, avgRating DESC, u.first_name ASC, u.user_id ASC
             LIMIT ${limit} OFFSET ${offset}`,
            [...proximityParams(place), ...whereParams]
        );

        return res.json({
            data: toDirectoryDTOList(rows),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            // Tells the UI what "nearby" was measured against
            viewerArea: place.city ? { city: place.city, province: place.province, neighbourhood: place.neighbourhood } : null,
        });
    } catch (err) {
        console.error('getDirectory error:', err);
        return res.status(500).json({ message: 'Error loading the directory.' });
    }
};

// ----------------------------------------------------------------
// GET /recommendations?service=&limit=
// "Recommended near you": nearest providers first, then by a rating that is
// not fooled by a single 5-star review (rating pulled toward 4.0 until a
// provider has a few reviews), then by jobs completed.
// ----------------------------------------------------------------
const getRecommendations = async (req, res) => {
    try {
        const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 6));
        const service = (req.query.service || '').trim();
        const place = await viewerPlace(req);

        const where = [...BASE_WHERE];
        const whereParams = [];
        if (req.user) {
            where.push('u.user_id <> ?');
            whereParams.push(req.user.id);
        }
        if (service) {
            where.push(`EXISTS (SELECT 1 FROM provider_details d JOIN services s ON s.service_id = d.service_id
                                WHERE d.user_id = u.user_id AND s.service_name = ?)`);
            whereParams.push(service);
        }

        const [rows] = await pool.execute(
            `SELECT * FROM (
                SELECT ${SELECT_COLUMNS}, ${PROXIMITY_SQL} AS proximity,
                       ((SELECT COALESCE(SUM(rv.rating), 0) FROM reviews rv WHERE rv.provider_id = u.user_id) + 4.0 * 3)
                       / ((SELECT COUNT(*) FROM reviews rv WHERE rv.provider_id = u.user_id) + 3) AS score
                FROM users u LEFT JOIN neighbourhoods nb ON nb.neighbourhood_id = u.neighbourhood_id
                WHERE ${where.join(' AND ')}
             ) ranked
             ORDER BY proximity ASC, score DESC, completedJobs DESC, id ASC
             LIMIT ${limit}`,
            [...proximityParams(place), ...whereParams]
        );

        return res.json({
            data: toDirectoryDTOList(rows),
            viewerArea: place.city ? { city: place.city, province: place.province, neighbourhood: place.neighbourhood } : null,
        });
    } catch (err) {
        console.error('getRecommendations error:', err);
        return res.status(500).json({ message: 'Error loading recommendations.' });
    }
};

module.exports = { getDirectory, getRecommendations };
