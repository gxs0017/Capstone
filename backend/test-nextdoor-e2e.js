// Smoke test for slots, board comments/likes, directory and payments against a
// locally running backend. BASE_URL overrides the default (use a spare port).
const BASE = (process.env.BASE_URL || 'http://localhost:5050') + '/api/auth';
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { console.log('PASS:', l); pass++; } else { console.log('FAIL:', l, d !== undefined ? '-> ' + JSON.stringify(d) : ''); fail++; } };
async function api(method, path, token, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
}
(async () => {
    const james = await api('POST', '/login', null, { email: 'james@gmail.com', password: 'pass123' });
    check('james login', james.status === 200, james);
    const t = james.body?.token;

    const svc = await api('GET', '/services', null);
    check('services list', svc.status === 200 && Array.isArray(svc.body?.services || svc.body), svc.status);

    // Fresh provider
    const email = `nd_${Date.now()}@test.local`;
    const reg = await api('POST', '/register', null, { firstName: 'Nd', lastName: 'Tester', email, password: 'TestPass1234', phoneNumber: '4165550123', dateOfBirth: '1990-01-01', address: { street: '1 Test St', city: 'Toronto', province: 'ON', postalCode: 'M5V2T6' }, role: 'PROVIDER', services: ['Tutoring'] });
    check('register provider', reg.status === 201, reg);
    const pid = reg.body?.user?.id;

    // Slots
    const d = new Date(); d.setDate(d.getDate() + 3);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const slots = await api('GET', `/providers/${pid}/slots?date=${day}`, t);
    check('slots returned', slots.status === 200 && slots.body?.slots?.length > 0, slots);
    const first = slots.body?.slots?.find((s) => s.available);

    const noTime = await api('POST', '/bookings', t, { providerId: pid, serviceId: 3 });
    check('booking without time rejected', noTime.status === 400, noTime);
    const when = `${day} ${first?.time || '10:00'}:00`;
    const bk = await api('POST', '/bookings', t, { providerId: pid, serviceId: 3, scheduledDate: when });
    check('booking with time created', bk.status === 201, bk);
    const dup = await api('POST', '/bookings', t, { providerId: pid, serviceId: 3, scheduledDate: when });
    check('double booking same slot rejected', dup.status >= 400 && dup.status < 500, dup);

    // Board
    const post = await api('POST', '/posts', t, { type: 'GENERAL', title: 'Anyone know a good plumber?', description: 'Looking for a recommendation.' });
    check('create post', post.status === 201, post);
    const postId = post.body?.id ?? post.body?.postId;
    const anon = await api('GET', `/posts/${postId}`, null);
    check('anon can read post', anon.status === 200, anon);
    const anonComment = await api('POST', `/posts/${postId}/comments`, null, { content: 'hi' });
    check('anon cannot comment', anonComment.status === 401, anonComment);
    const c1 = await api('POST', `/posts/${postId}/comments`, reg.body.token, { content: 'Try Acme Plumbing' });
    check('member comments', c1.status === 201, c1);
    const cid = c1.body?.id ?? c1.body?.commentId;
    const rep = await api('POST', `/posts/${postId}/comments`, t, { content: 'Thanks!', parentId: cid });
    check('reply', rep.status === 201, rep);
    const comments = await api('GET', `/posts/${postId}/comments`, null);
    check('anon reads comments', comments.status === 200 && JSON.stringify(comments.body).includes('Acme'), comments);
    const like = await api('POST', `/posts/${postId}/like`, t);
    check('like', like.status === 200, like);
    const list = await api('GET', '/posts?type=GENERAL', null);
    check('filter by category', list.status === 200, list.status);

    // Recommendations can no longer be posted (they are generated)
    const recPost = await api('POST', '/posts', t, { type: 'RECOMMENDATION', title: 'x', description: 'y' });
    check('RECOMMENDATION posts are rejected', recPost.status === 400, recPost);

    // Address validation: city / province / postal code must agree
    const bad = await api('POST', '/register', null, { firstName: 'Bad', lastName: 'Addr', email: `bad_${Date.now()}@test.local`, password: 'TestPass1234', phoneNumber: '4165550123', dateOfBirth: '1990-01-01', address: { street: '1 Test St', city: 'Brampton', province: 'BC', postalCode: 'L6T 1B4' }, role: 'REQUESTER' });
    check('mismatched province/postal code rejected', bad.status === 400 && /postal code/i.test(bad.body?.message || ''), bad);

    // Directory: providers only, and no contact details
    const dir = await api('GET', '/directory?limit=24', t);
    check('directory loads', dir.status === 200 && dir.body?.data?.length > 0, dir);
    const leaked = JSON.stringify(dir.body?.data || []);
    check('directory lists no requesters', !(dir.body?.data || []).some((e) => e.role === 'REQUESTER'), dir.body?.data?.[0]);
    check('directory shows no email/phone', !/"email"|"phone/i.test(leaked));
    const optIn = await api('PATCH', '/profile/directory', t, { bio: 'x' });
    check('requester cannot edit a public listing', optIn.status === 403, optIn);

    // Custom service tags + contact privacy (the fresh provider)
    const pt = reg.body.token;
    const tag = await api('POST', '/provider/my-services', pt, { serviceName: 'dog   walking', price: 22 });
    check('provider adds a brand-new service', tag.status === 201 && tag.body?.service?.serviceName === 'Dog Walking', tag);
    const dupTag = await api('POST', '/provider/my-services', pt, { serviceName: 'DOG WALKING' });
    check('same tag in other case is a duplicate', dupTag.status === 409, dupTag);
    const badTag = await api('POST', '/provider/my-services', pt, { serviceName: '<script>' });
    check('invalid service name rejected', badTag.status === 400, badTag);

    const hidden = await api('GET', `/providers/${pid}/profile`, null);
    check('contact hidden by default', hidden.status === 200 && !hidden.body?.email && !hidden.body?.phoneNumber, hidden.body);
    const search = await api('GET', `/providers?service=Dog%20Walking`, t);
    const found = (search.body?.data || []).find((p) => p.id === pid);
    check('provider found by custom service', !!found, search.body);
    check('search hides contact by default', found && !found.email && !found.phoneNumber, found);
    const showEmail = await api('PATCH', '/profile/contact', pt, { showEmail: true });
    check('provider can show email', showEmail.status === 200 && showEmail.body?.showEmail === true, showEmail);
    const shown = await api('GET', `/providers/${pid}/profile`, null);
    check('email now visible, phone still hidden', !!shown.body?.email && !shown.body?.phoneNumber, shown.body);
    const reqContact = await api('PATCH', '/profile/contact', t, { showEmail: true });
    check('requester cannot use contact switches', reqContact.status === 403, reqContact);

    // Recommendations (generated)
    const rec = await api('GET', '/recommendations?limit=5', t);
    check('recommendations load', rec.status === 200 && Array.isArray(rec.body?.data), rec);

    // Neighbourhood scope on the board
    const hood = await api('GET', '/posts?scope=neighbourhood', t);
    check('neighbourhood-scoped board loads', hood.status === 200, hood);

    // Address lookup endpoint (live geocoder; only checks the shape)
    const geo = await api('GET', '/geo/search?q=10%20Peel%20Centre%20Dr%20Brampton', null);
    check('address lookup responds', geo.status === 200 && Array.isArray(geo.body), geo.status);

    // Payments
    const methods = await api('GET', '/payments/methods', t);
    check('payment methods', methods.status === 200, methods);
    const sum = await api('GET', `/payments/summary/${bk.body?.bookingId}`, t);
    check('payment summary', sum.status === 200, sum);
    const mine = await api('GET', '/payments/mine', t);
    check('wallet', mine.status === 200, mine);

    // Cleanup disposable data
    await api('DELETE', `/posts/${postId}`, t).catch(() => {});
    // Remove the disposable rows this run created (only the tests' own fingerprints)
    try {
        const pool = require('./config/db');
        await require('./utils/testCleanup').removeTestData(pool);
        await pool.end();
    } catch (err) {
        console.log('Test-data cleanup skipped:', err.message);
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
