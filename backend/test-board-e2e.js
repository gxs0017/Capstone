// Smoke test for the Community Board + public provider profile, against a
// locally-running backend. Uses james's real account plus a fresh disposable
// test account (same pattern as test-chat-e2e.js).

const BASE = 'http://localhost:5050/api/auth';

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log('PASS:', label);
        passCount++;
    } else {
        console.log('FAIL:', label, detail !== undefined ? '-> ' + JSON.stringify(detail) : '');
        failCount++;
    }
}

async function api(method, path, token, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
}

async function main() {
    const jamesLogin = await api('POST', '/login', null, { email: 'james@gmail.com', password: 'pass123' });
    check('james login', jamesLogin.status === 200, jamesLogin);
    const jamesToken = jamesLogin.body?.token;

    // ── Public provider profile (no auth) ───────────────────────────────────
    const profile = await api('GET', '/providers/1/profile', null);
    check('public provider profile loads with no auth', profile.status === 200, profile);
    check('profile has services array', Array.isArray(profile.body?.services), profile.body);

    const reviewsPublic = await api('GET', '/reviews/provider/1', null);
    check('public reviews endpoint loads with no auth', reviewsPublic.status === 200, reviewsPublic);

    const missingProfile = await api('GET', '/providers/999999/profile', null);
    check('unknown provider id returns 404', missingProfile.status === 404, missingProfile);

    // ── Board: public browsing, no auth ─────────────────────────────────────
    const boardPublic = await api('GET', '/posts', null);
    check('board browsing works with no auth', boardPublic.status === 200 && Array.isArray(boardPublic.body?.data), boardPublic);

    // ── Creating requires auth + validation ─────────────────────────────────
    const noAuthCreate = await api('POST', '/posts', null, { type: 'WANTED', title: 'x', description: 'y' });
    check('creating a post without auth is rejected', noAuthCreate.status === 401, noAuthCreate);

    const badType = await api('POST', '/posts', jamesToken, { type: 'NOPE', title: 'x', description: 'y' });
    check('invalid type is rejected', badType.status === 400, badType);

    // ── Create a WANTED post as james ───────────────────────────────────────
    const created = await api('POST', '/posts', jamesToken, {
        type: 'WANTED', title: 'Need someone to shovel my driveway',
        description: 'Looking for help this weekend, flexible on time.', price: 30, city: 'Brampton',
    });
    check('create WANTED post', created.status === 201 && created.body?.type === 'WANTED', created);
    const postId = created.body?.postId;

    // ── It shows up on the public board, filterable by type ────────────────
    const wantedList = await api('GET', '/posts?type=WANTED&limit=50', null);
    check('new post appears in WANTED filter', wantedList.body?.data?.some((p) => p.postId === postId), wantedList.body);

    const offeringList = await api('GET', '/posts?type=OFFERING&limit=50', null);
    check('WANTED post does NOT appear in OFFERING filter', !offeringList.body?.data?.some((p) => p.postId === postId), offeringList.body);

    const searchHit = await api('GET', '/posts?search=driveway', null);
    check('keyword search finds the post', searchHit.body?.data?.some((p) => p.postId === postId), searchHit.body);

    // ── My posts ─────────────────────────────────────────────────────────────
    const mine = await api('GET', '/posts/mine', jamesToken);
    check('my posts includes the new post', mine.body?.some((p) => p.postId === postId), mine.body);

    // ── Register a second user, respond via chat ────────────────────────────
    const stamp = Date.now();
    const registerRes = await api('POST', '/register', null, {
        firstName: 'BoardTest', lastName: 'Responder', phoneNumber: '4165550999',
        dateOfBirth: '1995-01-01', email: `boardtest.${stamp}@example.com`, password: 'TestPass1234',
        address: { street: '2 Test St', city: 'Toronto', province: 'ON', postalCode: 'M1M1M1' },
        role: 'PROVIDER', services: ['Snow Shovelling'],
    });
    check('register responder', registerRes.status === 201, registerRes);
    const responderToken = registerRes.body?.token;

    const convo = await api('POST', '/chat/conversations', responderToken, { otherUserId: jamesLogin.body.user.id });
    check('responder can start a conversation with the poster (no booking needed)', convo.status === 201 || convo.status === 200, convo);

    // ── Close the post ───────────────────────────────────────────────────────
    const closeWrongUser = await api('PATCH', `/posts/${postId}/close`, responderToken, {});
    check('a non-owner cannot close the post', closeWrongUser.status === 404, closeWrongUser);

    const closeRight = await api('PATCH', `/posts/${postId}/close`, jamesToken, {});
    check('owner can close the post', closeRight.status === 200, closeRight);

    const afterClose = await api('GET', '/posts?limit=50', null);
    check('closed post no longer appears on the public board', !afterClose.body?.data?.some((p) => p.postId === postId), afterClose.body);

    // ── Admin delete ──────────────────────────────────────────────────────────
    const adminLogin = await api('POST', '/login', null, { email: 'admin@test.com', password: 'pass123' });
    check('admin login', adminLogin.status === 200, adminLogin);
    const adminToken = adminLogin.body?.token;

    const created2 = await api('POST', '/posts', jamesToken, {
        type: 'OFFERING', title: 'Delete-me test post', description: 'For admin delete test.', price: 10,
    });
    const deleteAsNonAdmin = await api('DELETE', `/admin/posts/${created2.body.postId}`, jamesToken);
    check('non-admin cannot delete a post', deleteAsNonAdmin.status === 403, deleteAsNonAdmin);

    const deleteAsAdmin = await api('DELETE', `/admin/posts/${created2.body.postId}`, adminToken);
    check('admin can delete a post', deleteAsAdmin.status === 200, deleteAsAdmin);

    // Remove the disposable rows this run created (only the tests' own fingerprints)
    try {
        const pool = require('./config/db');
        await require('./utils/testCleanup').removeTestData(pool);
        await pool.end();
    } catch (err) {
        console.log('Test-data cleanup skipped:', err.message);
    }
    console.log(`\n${passCount} passed, ${failCount} failed.`);
    console.log(`Responder test account: boardtest.${stamp}@example.com / TestPass1234 (safe to delete via admin).`);
    process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('Test script crashed:', err);
    process.exit(1);
});
