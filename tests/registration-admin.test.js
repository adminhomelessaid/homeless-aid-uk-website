const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, other, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, volunteer_number: 8 };
const done = { ...vol, date_of_birth: '1990-01-01', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'T', next_of_kin_phone: '07700900001', photo_data: 'x', photo_updated_at: '2026-01-01T00:00:00Z' };

const seed = () => ({
    users: [done, other, admin, lead, { ...other, id: 'u3', username: 'blocked', email: 'b@x.org', full_name: 'Blocked Person', is_active: false, volunteer_number: 3 }],
    policies: [{ id: 'p1', slug: 's', title: 'Safeguarding', sort_order: 1, is_active: true }],
    versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>x</p>' }],
    signatures: [{ id: 's1', user_id: 'u1', typed_name: 'Sarah Mitchell', signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1'] }]
});

test('volunteers: team lead gets list with state and counts; volunteer is refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.volunteers({ ...ctxFor(lead), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.volunteers.length, 5);
    const sarah = r.body.volunteers.find(v => v.id === 'u1');
    assert.equal(sarah.state.registration_complete, true);
    assert.equal(sarah.photo_data, undefined);
    assert.deepEqual(r.body.counts, { total: 5, complete: 1, needs_signing: 4, incomplete: 4, blocked: 1 });
    const denied = await handlers.volunteers({ ...ctxFor(vol), db });
    assert.equal(denied.status, 403);
});

test('volunteers: filters by q and status', async () => {
    const db = createFakeDb(seed());
    const q = await handlers.volunteers({ ...ctxFor(admin, { query: { q: 'sarah' } }), db });
    assert.deepEqual(q.body.volunteers.map(v => v.id), ['u1']);
    const blocked = await handlers.volunteers({ ...ctxFor(admin, { query: { status: 'blocked' } }), db });
    assert.deepEqual(blocked.body.volunteers.map(v => v.id), ['u3']);
    const complete = await handlers.volunteers({ ...ctxFor(admin, { query: { status: 'complete' } }), db });
    assert.deepEqual(complete.body.volunteers.map(v => v.id), ['u1']);
});

test('volunteer: returns record with signatures; 404 for unknown', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.volunteer({ ...ctxFor(lead, { query: { id: 'u1' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.full_name, 'Sarah Mitchell');
    assert.equal(r.body.signatures.length, 1);
    assert.equal(r.body.state.signature_status, 'signed');
    assert.equal((await handlers.volunteer({ ...ctxFor(lead, { query: { id: 'nope' } }), db })).status, 404);
});

test('admin-update-volunteer: admin edits partial details and role; team lead refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', team: 'Bury', role: 'team_lead', full_name: 'James Kowalski' } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._users.get('u2').team, 'Bury');
    assert.equal(db._users.get('u2').role, 'team_lead');
    assert.equal(db._users.get('u2').full_name, 'James Kowalski');
    const bad = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', role: 'god' } }), db });
    assert.equal(bad.status, 400);
    const denied = await handlers['admin-update-volunteer']({ ...ctxFor(lead, { method: 'POST', body: { user_id: 'u2', team: 'Bury' } }), db });
    assert.equal(denied.status, 403);
});

test('block and unblock flip is_active; admin cannot block self', async () => {
    const db = createFakeDb(seed());
    const b = await handlers.block({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2' } }), db });
    assert.equal(b.status, 200);
    assert.equal(db._users.get('u2').is_active, false);
    const u = await handlers.unblock({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2' } }), db });
    assert.equal(db._users.get('u2').is_active, true);
    const self = await handlers.block({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1' } }), db });
    assert.equal(self.status, 400);
    assert.equal(db._users.get('a1').is_active, true);
});

test('delete-volunteer requires matching confirm_name and refuses self', async () => {
    const db = createFakeDb(seed());
    const wrong = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', confirm_name: 'Wrong Name' } }), db });
    assert.equal(wrong.status, 400);
    assert.ok(db._users.has('u2'));
    const self = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1', confirm_name: 'Ad Min' } }), db });
    assert.equal(self.status, 400);
    assert.ok(db._users.has('a1'));
    const okr = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', confirm_name: 'james k' } }), db });
    assert.equal(okr.status, 200);
    assert.ok(!db._users.has('u2'));
});

test('export returns csv without photos; team lead refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.export({ ...ctxFor(admin), db });
    assert.equal(r.status, 200);
    assert.match(r.headers['Content-Disposition'], /volunteers-2026-10-13\.csv/);
    const lines = r.raw.split('\n');
    assert.equal(lines[0], 'volunteer_number,full_name,email,role,team,mobile_phone,date_of_birth,next_of_kin_name,next_of_kin_phone,is_active,details_complete,photo_complete,signature_status,signed_at,expires_at');
    assert.ok(lines.some(l => l.includes('Sarah Mitchell') && l.includes('signed')));
    assert.ok(!r.raw.includes('photo_data'));
    assert.equal((await handlers.export({ ...ctxFor(lead), db })).status, 403);
});
