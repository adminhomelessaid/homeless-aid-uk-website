const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers, dispatch, usernameFromEmail } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, approval_status: 'approved', volunteer_number: 9 };
const leadBolton = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Bolton', role: 'team_lead', is_active: true, approval_status: 'approved', team: 'Bolton, Bury', volunteer_number: 8 };
const hash = async (p) => `hashed:${p}`;
const good = { full_name: 'New Person', email: 'New.Person@Example.com', team: ['Bolton'], password: 'Strong1!pass' };
const pub = (over = {}) => ({ user: null, method: 'POST', query: {}, body: { ...good, ...over }, ip: '1.1.1.1', userAgent: 'test', now: NOW, hashPassword: hash });

test('usernameFromEmail lowercases, strips bad characters and suffixes when taken', () => {
    assert.equal(usernameFromEmail('New.Person@Example.com', () => false), 'new.person');
    assert.equal(usernameFromEmail('a b+c@x.org', () => false), 'ab-c');
    assert.equal(usernameFromEmail('taken@x.org', (u) => u === 'taken'), 'taken2');
});

test('signup creates a pending, inactive volunteer with a hashed password and generated username', async () => {
    const db = createFakeDb({ users: [admin] });
    const r = await handlers.signup({ ...pub(), db });
    assert.equal(r.status, 200);
    const row = [...db._users.values()].find(u => u.email === 'new.person@example.com');
    assert.ok(row, 'user created');
    assert.equal(row.username, 'new.person');
    assert.equal(row.role, 'volunteer');
    assert.equal(row.is_active, false);
    assert.equal(row.approval_status, 'pending');
    assert.equal(row.password_hash, 'hashed:Strong1!pass');
    assert.equal(row.team, 'Bolton');
    assert.equal(row.email_verified, false);
    assert.equal(r.body.user, undefined, 'nothing sensitive returned');
});

test('signup rejects bad input and duplicate emails, and silently ignores bots', async () => {
    const db = createFakeDb({ users: [admin, { ...vol, email: 'dupe@x.org' }] });
    assert.equal((await handlers.signup({ ...pub({ full_name: 'A' }), db })).status, 400);
    assert.equal((await handlers.signup({ ...pub({ email: 'not-an-email' }), db })).status, 400);
    assert.equal((await handlers.signup({ ...pub({ team: [] }), db })).status, 400);
    assert.equal((await handlers.signup({ ...pub({ password: 'weak' }), db })).status, 400);
    assert.equal((await handlers.signup({ ...pub({ email: 'DUPE@x.org' }), db })).status, 409);
    const bot = await handlers.signup({ ...pub({ website: 'http://spam' }), db });
    assert.equal(bot.status, 200);
    assert.equal([...db._users.values()].some(u => u.email === 'new.person@example.com'), false, 'bot not stored');
});

test('signup is reachable through dispatch without a user, and rejects GET', async () => {
    const db = createFakeDb({ users: [admin] });
    assert.equal((await dispatch('signup', { ...pub(), db })).status, 200);
    assert.equal((await dispatch('signup', { ...pub(), method: 'GET', db })).status, 405);
});

test('pending-signups: admin sees all, team lead sees only matching teams, volunteer refused', async () => {
    const db = createFakeDb({ users: [admin, leadBolton, vol,
        { id: 'p1', username: 'p1', email: 'p1@x.org', full_name: 'Pending Bolton', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Bolton', created_at: '2026-10-13T09:00:00Z' },
        { id: 'p2', username: 'p2', email: 'p2@x.org', full_name: 'Pending Wigan', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Wigan', created_at: '2026-10-13T09:05:00Z' }] });
    const all = await handlers['pending-signups']({ ...ctxFor(admin), db });
    assert.deepEqual(all.body.pending.map(p => p.id), ['p1', 'p2']);
    const mine = await handlers['pending-signups']({ ...ctxFor(leadBolton), db });
    assert.deepEqual(mine.body.pending.map(p => p.id), ['p1']);
    assert.equal((await handlers['pending-signups']({ ...ctxFor(vol), db })).status, 403);
});

test('approve-signup activates the account, records who approved, emails best-effort; team lead limited to own teams', async () => {
    const db = createFakeDb({ users: [admin, leadBolton,
        { id: 'p1', username: 'p1', email: 'p1@x.org', full_name: 'Pending Bolton', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Bolton' },
        { id: 'p2', username: 'p2', email: 'p2@x.org', full_name: 'Pending Wigan', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Wigan' }] });
    const sent = [];
    const r = await handlers['approve-signup']({ ...ctxFor(leadBolton, { method: 'POST', body: { user_id: 'p1' }, origin: 'https://example.test' }), db, sendApproval: async (p) => { sent.push(p); return { success: true }; } });
    assert.equal(r.status, 200);
    const row = db._users.get('p1');
    assert.equal(row.is_active, true);
    assert.equal(row.approval_status, 'approved');
    assert.equal(row.approved_by, 'l1');
    assert.ok(row.approved_at);
    assert.equal(sent[0].to, 'p1@x.org');
    assert.ok(sent[0].loginUrl.endsWith('/portal'));
    assert.equal(r.body.emailed, true);
    assert.equal((await handlers['approve-signup']({ ...ctxFor(leadBolton, { method: 'POST', body: { user_id: 'p2' } }), db, sendApproval: async () => ({ success: true }) })).status, 403);
    assert.equal((await handlers['approve-signup']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'p1' } }), db })).status, 400, 'already approved');
});

test('reject-signup deletes only pending accounts', async () => {
    const db = createFakeDb({ users: [admin, vol, { id: 'p1', username: 'p1', email: 'p1@x.org', full_name: 'P', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Bolton' }] });
    assert.equal((await handlers['reject-signup']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u1' } }), db })).status, 400);
    assert.ok(db._users.has('u1'));
    assert.equal((await handlers['reject-signup']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'p1' } }), db })).status, 200);
    assert.ok(!db._users.has('p1'));
});

test('volunteers list leaves pending sign-ups out and reports their count', async () => {
    const db = createFakeDb({ users: [admin, vol, { id: 'p1', username: 'p1', email: 'p1@x.org', full_name: 'P', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Bolton' }] });
    const r = await handlers.volunteers({ ...ctxFor(admin), db });
    assert.equal(r.body.volunteers.some(v => v.id === 'p1'), false);
    assert.equal(r.body.counts.pending, 1);
});
