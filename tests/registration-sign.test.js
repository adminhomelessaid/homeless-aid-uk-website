const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, ctxFor } = require('./helpers/fixtures');

const seed = () => ({
    users: [vol],
    policies: [
        { id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 2, is_active: true },
        { id: 'p2', slug: 'expectations', title: 'Volunteer Expectations', sort_order: 1, is_active: true },
        { id: 'p3', slug: 'old', title: 'Retired', sort_order: 3, is_active: false }
    ],
    versions: [
        { id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>old</p>' },
        { id: 'v1b', policy_id: 'p1', version: 2, body_html: '<p>new</p>' },
        { id: 'v2', policy_id: 'p2', version: 1, body_html: '<p>exp</p>' },
        { id: 'v3', policy_id: 'p3', version: 1, body_html: '<p>retired</p>' }
    ]
});

test('policies returns active policies in order with current body', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.policies({ ...ctxFor(vol), db });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.policies.map(p => p.slug), ['expectations', 'safeguarding']);
    assert.equal(r.body.policies[1].current_version.id, 'v1b');
    assert.equal(r.body.policies[1].current_version.body_html, '<p>new</p>');
    assert.equal(r.body.state.signature_status, 'none');
});

test('sign records a signature covering current versions, 12 month expiry, audit fields', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: '  sarah   MITCHELL ', version_ids: ['v2', 'v1b'] } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.state.signature_status, 'signed');
    assert.equal(r.body.signature.expires_at, '2027-10-13T10:00:00.000Z');
    const row = db._signatures[0];
    assert.equal(row.user_id, 'u1');
    assert.equal(row.typed_name, 'sarah   MITCHELL'.trim());
    assert.deepEqual([...row.version_ids].sort(), ['v1b', 'v2']);
    assert.equal(row.ip_address, '1.2.3.4');
    assert.equal(row.user_agent, 'test');
});

test('sign rejects wrong name', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Someone Else', version_ids: ['v2', 'v1b'] } }), db });
    assert.equal(r.status, 400);
    assert.equal(db._signatures.length, 0);
});

test('sign rejects stale version list with 409 and names policies', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2', 'v1'] } }), db });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.outdated_policies, ['Safeguarding']);
    assert.equal(db._signatures.length, 0);
});

test('sign rejects missing policy or extra unknown ids', async () => {
    const db = createFakeDb(seed());
    const missing = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2'] } }), db });
    assert.equal(missing.status, 409);
    const extra = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2', 'v1b', 'v3'] } }), db });
    assert.equal(extra.status, 409);
});

test('sign with no active policies is refused', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: [] } }), db });
    assert.equal(r.status, 400);
});
