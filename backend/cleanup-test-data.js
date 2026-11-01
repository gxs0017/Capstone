// Removes the disposable rows the automated test scripts (test-*-e2e.js) leave
// behind in the shared database: throw-away test providers and their bookings /
// chats / payments (these cascade), the tests' board posts, and the "Dog Walking"
// service the tag test creates once nobody offers it.
//
//   node cleanup-test-data.js            -> dry run: lists what WOULD be removed
//   node cleanup-test-data.js --apply    -> removes it
//
// It only matches the tests' own fingerprints (their email patterns and exact
// post titles) — real accounts and posts are never touched.
const pool = require('./config/db');
const { TEST_EMAIL_PATTERNS, TEST_POST_TITLES, TEST_SERVICE_NAMES, removeTestData } = require('./utils/testCleanup');

const apply = process.argv.includes('--apply');

async function main() {
    console.log(apply ? 'MODE: apply' : 'MODE: dry run (nothing is removed)');
    const found = await removeTestData(pool, { dryRun: !apply });
    console.log(`Test users:    ${found.users.length}`, found.users.map((u) => u.email));
    console.log(`Test posts:    ${found.posts.length}`, found.posts.map((p) => `#${p.post_id} ${p.title}`));
    console.log(`Test services: ${found.services.length}`, found.services.map((s) => s.service_name));
    console.log(apply ? '\nRemoved.' : '\nRun with --apply to remove them.');
    await pool.end();
}

main().catch((err) => { console.error('Cleanup failed:', err.message); process.exit(1); });
