// utils/testCleanup.js
// Shared by cleanup-test-data.js and the e2e test scripts so tests can remove
// their own disposable rows. Only matches the tests' own fingerprints.

const TEST_EMAIL_PATTERNS = ['chattest.provider.%@example.com', 'nd\\_%@test.local', 'boardtest.%@example.com'];
const TEST_POST_TITLES = ['Best plumber nearby?', 'Anyone know a good plumber?', 'Delete-me test post', 'Realtime check'];
const TEST_SERVICE_NAMES = ['Dog Walking'];

/** Finds (and unless dryRun, deletes) test users, posts and orphaned test services. */
const removeTestData = async (pool, { dryRun = false } = {}) => {
    const emailWhere = TEST_EMAIL_PATTERNS.map(() => 'email LIKE ?').join(' OR ');
    const [users] = await pool.query(`SELECT user_id, email FROM users WHERE ${emailWhere}`, TEST_EMAIL_PATTERNS);
    const [posts] = await pool.query('SELECT post_id, title FROM posts WHERE title IN (?)', [TEST_POST_TITLES]);

    if (!dryRun) {
        if (posts.length) await pool.query('DELETE FROM posts WHERE post_id IN (?)', [posts.map((p) => p.post_id)]);
        if (users.length) await pool.query('DELETE FROM users WHERE user_id IN (?)', [users.map((u) => u.user_id)]);
    }

    // Test services are removed only when no provider offers them any more
    const [services] = await pool.query(
        `SELECT s.service_id, s.service_name FROM services s
         WHERE s.service_name IN (?) AND NOT EXISTS (SELECT 1 FROM provider_details d WHERE d.service_id = s.service_id)`,
        [TEST_SERVICE_NAMES]
    );
    if (!dryRun && services.length) await pool.query('DELETE FROM services WHERE service_id IN (?)', [services.map((s) => s.service_id)]);

    return { users, posts, services };
};

module.exports = { removeTestData, TEST_EMAIL_PATTERNS, TEST_POST_TITLES, TEST_SERVICE_NAMES };
