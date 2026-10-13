const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };

test('send-reset-link clears the password, issues a fresh token and emails the user', async () => {
    const db = createFakeDb({ users: [admin, { ...vol, password_hash: 'OLD' }] });
    const sent = [];
    const r = await handlers['send-reset-link']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u1' }, origin: 'https://example.test' }), db, sendInvitation: async (p) => { sent.push(p); return { success: true }; } });
    assert.equal(r.status, 200);
    const row = db._users.get('u1');
    assert.equal(row.password_hash, null);
    assert.match(row.invitation_token, /^[a-f0-9]{64}$/);
    assert.ok(row.invitation_sent_at);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 's@x.org');
    assert.ok(sent[0].invitationUrl.startsWith('https://example.test/portal/setup-password.html?token='));
    assert.equal(r.body.emailed, true);
});

test('send-reset-link still succeeds when the email fails, and reports it', async () => {
    const db = createFakeDb({ users: [admin, vol] });
    const r = await handlers['send-reset-link']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u1' }, origin: 'https://example.test' }), db, sendInvitation: async () => ({ success: false, message: 'no mail' }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.emailed, false);
    assert.ok(r.body.setup_url.includes('setup-password.html?token='));
});

test('send-reset-link is admin only and refuses self', async () => {
    const db = createFakeDb({ users: [admin, vol] });
    assert.equal((await handlers['send-reset-link']({ ...ctxFor(vol, { method: 'POST', body: { user_id: 'a1' } }), db })).status, 403);
    assert.equal((await handlers['send-reset-link']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1' } }), db })).status, 400);
    assert.equal((await handlers['send-reset-link']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'nope' } }), db })).status, 404);
});
