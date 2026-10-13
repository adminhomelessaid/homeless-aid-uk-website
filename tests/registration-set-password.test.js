const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, volunteer_number: 8 };
const hash = async (p) => `hashed:${p}`;

test('admin sets a volunteer password directly; it is hashed and any reset token is cleared', async () => {
    const db = createFakeDb({ users: [admin, { ...vol, invitation_token: 'old', password_hash: 'OLD' }] });
    const r = await handlers['set-password']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u1', password: 'rovers12' } }), db, hashPassword: hash });
    assert.equal(r.status, 200);
    const row = db._users.get('u1');
    assert.equal(row.password_hash, 'hashed:rovers12');
    assert.equal(row.invitation_token, null);
    assert.ok(row.password_set_at);
    assert.equal(r.body.password, undefined, 'the password is never echoed back');
});

test('set-password enforces the password rule, refuses self and non-admins, 404s unknown users', async () => {
    const db = createFakeDb({ users: [admin, lead, vol] });
    assert.equal((await handlers['set-password']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u1', password: 'short' } }), db, hashPassword: hash })).status, 400);
    assert.equal((await handlers['set-password']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1', password: 'rovers12' } }), db, hashPassword: hash })).status, 400);
    assert.equal((await handlers['set-password']({ ...ctxFor(lead, { method: 'POST', body: { user_id: 'u1', password: 'rovers12' } }), db, hashPassword: hash })).status, 403);
    assert.equal((await handlers['set-password']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'nope', password: 'rovers12' } }), db, hashPassword: hash })).status, 404);
    assert.equal(db._users.get('u1').password_hash, undefined);
});
