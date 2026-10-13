const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');

const { NOW, vol, other, ctxFor } = require('./helpers/fixtures');

test('ping returns ok', async () => {
    const db = createFakeDb();
    const r = await handlers.ping({ db, now: NOW });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
});

test('me returns own profile, state and policies, ignoring ?id', async () => {
    const db = createFakeDb({ users: [vol, other], policies: [{ id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 1, is_active: true }], versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>x</p>' }] });
    const r = await handlers.me({ ...ctxFor(vol, { query: { id: 'u2' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'u1');
    assert.equal(r.body.user.password_hash, undefined);
    assert.equal(r.body.state.signature_status, 'none');
    assert.equal(r.body.policies.length, 1);
    assert.equal(r.body.policies[0].current_version.id, 'v1');
    assert.equal(r.body.policies[0].current_version.body_html, undefined, 'me does not send bodies');
    assert.deepEqual(r.body.teams, ['Bolton','Manchester','Bury','Liverpool','Wigan','Oldham','Glasgow','Leigh','Other']);
});

test('update-me writes only allowed fields to own record', async () => {
    const db = createFakeDb({ users: [vol, other] });
    const body = { date_of_birth: '1990-05-04', mobile_phone: '07700 900000', team: 'Bolton', next_of_kin_name: 'Tom', next_of_kin_phone: '07700 900001', role: 'admin', id: 'u2' };
    const r = await handlers['update-me']({ ...ctxFor(vol, { method: 'POST', body }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.team, 'Bolton');
    assert.equal(db._users.get('u1').role, 'volunteer');
    assert.equal(db._users.get('u2').team, undefined);
    assert.equal(r.body.state.details_complete, true);
});

test('update-me rejects bad date, unknown team, bad phone', async () => {
    const db = createFakeDb({ users: [vol] });
    const base = { date_of_birth: '1990-05-04', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'Tom', next_of_kin_phone: '07700900001' };
    for (const bad of [{ date_of_birth: '04/05/1990' }, { date_of_birth: '2030-01-01' }, { team: 'Mars' }, { mobile_phone: 'abc' }]) {
        const r = await handlers['update-me']({ ...ctxFor(vol, { method: 'POST', body: { ...base, ...bad } }), db });
        assert.equal(r.status, 400, JSON.stringify(bad));
    }
});

test('update-me rejects GET', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers['update-me']({ ...ctxFor(vol), db });
    assert.equal(r.status, 405);
});
