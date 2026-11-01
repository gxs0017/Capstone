// Real-time smoke test: two signed-in sockets, and the events that should reach
// them within a second — new board post, live comment, like count, booking
// request/confirmation. Needs a locally running backend (BASE_URL, default 5050).
// socket.io-client is borrowed from the frontend's node_modules.
const { io } = require('../frontend/node_modules/socket.io-client');
const ORIGIN = process.env.BASE_URL || 'http://localhost:5050';
const BASE = ORIGIN + '/api/auth';
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { console.log('PASS:', l); pass++; } else { console.log('FAIL:', l, d !== undefined ? '-> ' + JSON.stringify(d) : ''); fail++; } };
async function api(method, path, token, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
}
const connect = (token) => new Promise((resolve, reject) => {
    const s = io(ORIGIN, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
});
// Resolves with the first payload of `event` (matching `pred`), or null after `ms`
const waitFor = (socket, event, pred = () => true, ms = 2500) => new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, h); resolve(null); }, ms);
    const h = (p) => { if (pred(p)) { clearTimeout(t); socket.off(event, h); resolve(p); } };
    socket.on(event, h);
});

(async () => {
    const james = await api('POST', '/login', null, { email: 'james@gmail.com', password: 'pass123' });
    const jt = james.body?.token;
    const reg = await api('POST', '/register', null, { firstName: 'Rt', lastName: 'Tester', email: `nd_rt_${Date.now()}@test.local`, password: 'TestPass1234', phoneNumber: '4165550123', dateOfBirth: '1990-01-01', address: { street: '1 Test St', city: 'Toronto', province: 'ON', postalCode: 'M5V2T6' }, role: 'PROVIDER', services: ['Tutoring'] });
    const pt = reg.body?.token, pid = reg.body?.user?.id;
    check('two accounts ready', !!jt && !!pt);

    const sJames = await connect(jt);
    const sProv = await connect(pt);
    check('both sockets connect', sJames.connected && sProv.connected);

    // Board: new post reaches the other member instantly
    let t0 = Date.now();
    const newPost = waitFor(sProv, 'post:new', (p) => p.title === 'Realtime check');
    const post = await api('POST', '/posts', jt, { type: 'GENERAL', title: 'Realtime check', description: 'live feed test' });
    const gotPost = await newPost;
    check('new post pushed to other member', !!gotPost, null);
    console.log(`   (${Date.now() - t0} ms)`);
    const postId = post.body?.postId;

    // Comments: watcher of the post sees a comment live; counts update on the board
    sProv.emit('post:join', postId);
    await new Promise((r) => setTimeout(r, 200));
    t0 = Date.now();
    const liveComment = waitFor(sProv, 'comment:new', (c) => c.postId === postId);
    const stats = waitFor(sJames, 'post:stats', (e) => e.postId === postId);
    await api('POST', `/posts/${postId}/comments`, jt, { content: 'first!' });
    const gotComment = await liveComment;
    check('comment appears live for a watcher', gotComment?.content === 'first!');
    check('comment count pushed to the board', (await stats)?.commentCount === 1);
    console.log(`   (${Date.now() - t0} ms)`);

    // Bookings: provider hears about a new request; requester hears it was confirmed
    const day = new Date(); day.setDate(day.getDate() + 4); day.setHours(11, 0, 0, 0);
    const when = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')} 11:00:00`;
    const gotReq = waitFor(sProv, 'booking:changed', (e) => e.reason === 'created');
    const bk = await api('POST', '/bookings', jt, { providerId: pid, serviceId: 3, scheduledDate: when });
    const reqEvt = await gotReq;
    check('provider is told of a new booking request', reqEvt?.bookingId === bk.body?.bookingId && reqEvt?.actorId != null, reqEvt);
    const confirmed = waitFor(sJames, 'booking:changed', (e) => e.reason === 'confirmed');
    await api('PATCH', `/bookings/${bk.body?.bookingId}/status`, pt, { status: 'CONFIRMED' });
    check('requester is told the booking was confirmed', !!(await confirmed));

    // Privacy: an outsider's socket must NOT get another user's booking events
    const outsider = await api('POST', '/register', null, { firstName: 'Out', lastName: 'Sider', email: `nd_out_${Date.now()}@test.local`, password: 'TestPass1234', phoneNumber: '4165550123', dateOfBirth: '1990-01-01', address: { street: '1 Test St', city: 'Toronto', province: 'ON', postalCode: 'M5V2T6' }, role: 'REQUESTER' });
    const sOut = await connect(outsider.body?.token);
    const leaked = waitFor(sOut, 'booking:changed', () => true, 1500);
    await api('PATCH', `/bookings/${bk.body?.bookingId}/status`, jt, { status: 'CANCELLED' });
    check('outsider receives no booking events', (await leaked) === null);

    [sJames, sProv, sOut].forEach((s) => s.close());
    try {
        const pool = require('./config/db');
        await require('./utils/testCleanup').removeTestData(pool);
        await pool.end();
    } catch (err) { console.log('Test-data cleanup skipped:', err.message); }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
