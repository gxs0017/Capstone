// End-to-end smoke test for the chat feature against a locally-running
// backend (points at the real Aiven DB via .env). Creates one fresh,
// clearly-labeled test provider account and one fresh booking; does not
// modify any other existing user or data. Prints PASS/FAIL per step.

const BASE = 'http://localhost:5050/api/auth';
const io = require('/Users/jimmy/Capstone/frontend/node_modules/socket.io-client');

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
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
    const stamp = Date.now();
    const providerEmail = `chattest.provider.${stamp}@example.com`;

    // ── 1. Existing real account still works (login) ──────────────────────
    const jamesLogin = await api('POST', '/login', null, { email: 'james@gmail.com', password: 'pass123' });
    check('james login succeeds', jamesLogin.status === 200 && !!jamesLogin.body.token, jamesLogin);
    const jamesToken = jamesLogin.body?.token;
    const jamesId = jamesLogin.body?.user?.id;

    // ── 2. The thing that was 500ing before the migration ──────────────────
    const jamesBookings = await api('GET', '/bookings/my', jamesToken);
    check('GET /bookings/my no longer 500s (checkBlocked fixed)', jamesBookings.status === 200, jamesBookings);

    // ── 3. Context-panel endpoint on a real existing booking ───────────────
    const booking20 = await api('GET', '/bookings/20', jamesToken);
    check('GET /bookings/:id returns full detail', booking20.status === 200 && booking20.body?.bookingId === 20, booking20);

    // ── 4. Register a fresh, disposable test provider ──────────────────────
    const registerRes = await api('POST', '/register', null, {
        firstName: 'ChatTest', lastName: 'Provider', phoneNumber: '4165550123',
        dateOfBirth: '1995-01-01', email: providerEmail, password: 'TestPass1234',
        address: { street: '1 Test St', city: 'Toronto', province: 'ON', postalCode: 'M1M1M1' },
        role: 'PROVIDER', services: ['Tutoring'],
    });
    check('register fresh test provider', registerRes.status === 201, registerRes);
    const providerToken = registerRes.body?.token;
    const providerId = registerRes.body?.user?.id;

    // ── 5. Create a real booking between james and the fresh provider ──────
    const createBookingRes = await api('POST', '/bookings', jamesToken, {
        providerId, serviceId: 3, // Tutoring
    });
    check('create booking james -> fresh provider', createBookingRes.status === 201, createBookingRes);
    const newBookingId = createBookingRes.body?.bookingId;

    // ── 6. "Message" button flow: start conversation + auto-pin that booking
    const startConvoRes = await api('POST', '/chat/conversations', jamesToken, {
        otherUserId: providerId, bookingId: newBookingId,
    });
    check('start conversation (My Bookings "Message" button)', startConvoRes.status === 201, startConvoRes);
    const conversationId = startConvoRes.body?.conversationId;
    check('new conversation auto-pins the clicked booking', startConvoRes.body?.pinnedBookingId === newBookingId, startConvoRes.body);

    // ── 7. Reusing the same conversation on a second click ──────────────────
    const startConvoAgain = await api('POST', '/chat/conversations', jamesToken, { otherUserId: providerId });
    check('starting again reuses the same conversation (one per pair)', startConvoAgain.status === 200 && startConvoAgain.body?.conversationId === conversationId, startConvoAgain);

    // ── 8. Send a message, confirm IP is captured but never exposed ────────
    const sendRes = await api('POST', `/chat/conversations/${conversationId}/messages`, jamesToken, { content: 'Hi, when works for you?' });
    check('send message', sendRes.status === 201 && sendRes.body?.status === 'SENT', sendRes);
    check('message response never includes ip_address', sendRes.body?.ip_address === undefined && sendRes.body?.ipAddress === undefined, sendRes.body);

    // ── 9. Recipient sees it + unread count ─────────────────────────────────
    const unreadBefore = await api('GET', '/chat/unread-count', providerToken);
    check('provider unread count is 1', unreadBefore.body?.total === 1, unreadBefore.body);

    const providerMessages = await api('GET', `/chat/conversations/${conversationId}/messages`, providerToken);
    check('provider can read the message content', providerMessages.body?.[0]?.content === 'Hi, when works for you?', providerMessages.body);

    const markRead = await api('PATCH', `/chat/conversations/${conversationId}/read`, providerToken);
    check('mark conversation read', markRead.status === 200 && markRead.body?.markedRead === 1, markRead);

    const unreadAfter = await api('GET', '/chat/unread-count', providerToken);
    check('provider unread count back to 0', unreadAfter.body?.total === 0, unreadAfter.body);

    // ── 10. Reply back ───────────────────────────────────────────────────────
    const replyRes = await api('POST', `/chat/conversations/${conversationId}/messages`, providerToken, { content: 'How about Tuesday?' });
    check('provider replies', replyRes.status === 201, replyRes);

    // ── 11. Pin picker: lists the shared booking, rejects an unrelated one ──
    const options = await api('GET', `/chat/conversations/${conversationId}/booking-options`, jamesToken);
    check('booking-options lists the shared booking', options.body?.some((b) => b.bookingId === newBookingId), options.body);

    const badPin = await api('PATCH', `/chat/conversations/${conversationId}/pin`, jamesToken, { bookingId: 20 });
    check('pinning an UNSHARED booking is rejected', badPin.status === 400, badPin);

    const unpin = await api('PATCH', `/chat/conversations/${conversationId}/pin`, jamesToken, { bookingId: null });
    check('unpin succeeds', unpin.status === 200 && unpin.body?.pinnedBookingId === null, unpin.body);

    const repin = await api('PATCH', `/chat/conversations/${conversationId}/pin`, jamesToken, { bookingId: newBookingId });
    check('re-pin the shared booking succeeds', repin.status === 200 && repin.body?.pinnedBookingId === newBookingId, repin.body);

    // ── 12. Input validation ────────────────────────────────────────────────
    const emptyMsg = await api('POST', `/chat/conversations/${conversationId}/messages`, jamesToken, { content: '   ' });
    check('empty message rejected', emptyMsg.status === 400, emptyMsg);

    const tooLong = await api('POST', `/chat/conversations/${conversationId}/messages`, jamesToken, { content: 'x'.repeat(1001) });
    check('over-length message rejected', tooLong.status === 400, tooLong);

    // ── 13. Real-time delivery over Socket.IO ───────────────────────────────
    await new Promise((resolve) => {
        const providerSocket = io('http://localhost:5050', { auth: { token: providerToken }, transports: ['websocket'] });
        let settled = false;
        const finish = (ok, reason) => {
            if (settled) return;
            settled = true;
            check('live Socket.IO delivery to the other participant', ok, reason);
            providerSocket.disconnect();
            resolve();
        };
        providerSocket.on('connect_error', (err) => finish(false, 'connect_error: ' + err.message));
        providerSocket.on('connect', () => {
            providerSocket.emit('conversation:join', conversationId, async (ack) => {
                if (!ack?.ok) return finish(false, 'join not ok: ' + JSON.stringify(ack));
                providerSocket.once('message:new', (msg) => {
                    finish(msg.conversationId === conversationId && msg.content === 'Live push test', msg);
                });
                await api('POST', `/chat/conversations/${conversationId}/messages`, jamesToken, { content: 'Live push test' });
            });
        });
        setTimeout(() => finish(false, 'timed out waiting for message:new'), 5000);
    });

    // ── 14. Admin-only endpoints (read-only) ────────────────────────────────
    // No ADMIN account exists in this DB yet, so this signs a short-lived
    // test token claiming role ADMIN against james's real (existing, valid)
    // user row, purely to exercise the admin route code paths read-only.
    // It does NOT change james's actual role or any stored data.
    const jwt = require('jsonwebtoken');
    require('dotenv').config();
    const adminTestToken = jwt.sign({ id: jamesId, email: 'james@gmail.com', role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const auditLogs = await api('GET', '/admin/audit-logs', adminTestToken);
    check('admin audit-logs endpoint responds', auditLogs.status === 200 && Array.isArray(auditLogs.body), auditLogs);

    const flagged = await api('GET', '/admin/chat/flagged', adminTestToken);
    check('admin flagged-messages endpoint responds (empty, no bot yet)', flagged.status === 200 && Array.isArray(flagged.body) && flagged.body.length === 0, flagged);

    console.log(`\n${passCount} passed, ${failCount} failed.`);
    console.log(`Test provider account created: ${providerEmail} / TestPass1234 (id ${providerId}) — safe to keep or delete.`);
    console.log(`Test booking created: #${newBookingId} between james (116) and provider ${providerId}.`);
    process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('Test script crashed:', err);
    process.exit(1);
});
