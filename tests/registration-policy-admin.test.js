const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const seed = () => ({
    users: [admin, vol],
    policies: [{ id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 1, is_active: true }],
    versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>one</p>' }]
});

test('policy-save creates a new policy with slug, version 1, sanitised body', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'Volunteer Expectations', body_html: '<h2>Hi</h2><script>x()</script><p onclick="y">text</p>' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.policy.slug, 'volunteer-expectations');
    assert.equal(r.body.policy.sort_order, 2);
    assert.equal(r.body.policy.current_version.version, 1);
    assert.equal(r.body.policy.current_version.body_html, '<h2>Hi</h2><p>text</p>');
    assert.equal(r.body.policy.current_version.created_by, 'a1');
});

test('policy-save on existing policy adds version 2 with change note and new title', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'p1', title: 'Safeguarding Policy', body_html: '<p>two</p>', change_note: 'Updated contacts' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.policy.title, 'Safeguarding Policy');
    assert.equal(r.body.policy.current_version.version, 2);
    assert.equal(r.body.policy.current_version.change_note, 'Updated contacts');
    assert.equal(db._versions.length, 2);
});

test('policy-save rejects empty body, missing title, duplicate slug, non-admin', async () => {
    const db = createFakeDb(seed());
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'X', body_html: '<script>a</script>' } }), db })).status, 400);
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { body_html: '<p>a</p>' } }), db })).status, 400);
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'Safeguarding', body_html: '<p>a</p>' } }), db })).status, 409);
    assert.equal((await handlers['policy-save']({ ...ctxFor(vol, { method: 'POST', body: { title: 'X', body_html: '<p>a</p>' } }), db })).status, 403);
});

test('policy-reorder sets sort_order in the given order', async () => {
    const db = createFakeDb({ ...seed(), policies: [
        { id: 'p1', slug: 'a', title: 'A', sort_order: 1, is_active: true },
        { id: 'p2', slug: 'b', title: 'B', sort_order: 2, is_active: true }
    ] });
    const r = await handlers['policy-reorder']({ ...ctxFor(admin, { method: 'POST', body: { order: ['p2', 'p1'] } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._policies.get('p2').sort_order, 1);
    assert.equal(db._policies.get('p1').sort_order, 2);
});

test('policy-retire toggles is_active and policies-admin lists inactive too', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-retire']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'p1', is_active: false } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._policies.get('p1').is_active, false);
    const list = await handlers['policies-admin']({ ...ctxFor(admin), db });
    assert.equal(list.body.policies.length, 1);
    assert.equal(list.body.policies[0].is_active, false);
    const pub = await handlers.policies({ ...ctxFor(vol), db });
    assert.equal(pub.body.policies.length, 0);
});
