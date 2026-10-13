const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { computeRegistrationState } = require('../utils/registration-state');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const seed = () => ({
    users: [vol, admin],
    policies: [
        { id: 'agr', slug: 'volunteer-agreement', title: 'Volunteer Agreement', sort_order: 1, is_active: true, requires_signature: true },
        { id: 'safe', slug: 'safeguarding', title: 'Safeguarding Policy', sort_order: 2, is_active: true, requires_signature: false },
        { id: 'data', slug: 'data-protection', title: 'Data Protection Policy', sort_order: 3, is_active: true, requires_signature: false }
    ],
    versions: [
        { id: 'v-agr', policy_id: 'agr', version: 1, body_html: '<p>agreement</p>' },
        { id: 'v-safe', policy_id: 'safe', version: 1, body_html: '<p>safe</p>' },
        { id: 'v-data', policy_id: 'data', version: 1, body_html: '<p>data</p>' }
    ]
});
const full = { date_of_birth: '1990-01-01', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'A', next_of_kin_phone: '0123', has_photo: true };

test('policies action returns every active document, flagged, and me only counts signed ones', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.policies({ ...ctxFor(vol), db });
    assert.deepEqual(r.body.policies.map(p => [p.slug, p.requires_signature]), [['volunteer-agreement', true], ['safeguarding', false], ['data-protection', false]]);
    const m = await handlers.me({ ...ctxFor(vol), db });
    assert.equal(m.body.policies.length, 3);
    assert.equal(m.body.to_sign.length, 1);
    assert.equal(m.body.to_sign[0].slug, 'volunteer-agreement');
});

test('signing covers only documents that require a signature', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v-agr'] } }), db });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(db._signatures[0].version_ids, ['v-agr']);
    assert.equal(r.body.state.signature_status, 'signed');
    const extra = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v-agr', 'v-safe'] } }), db });
    assert.equal(extra.status, 409, 'reference documents are not part of the declaration');
});

test('editing a reference policy does not make a signature outdated; editing the agreement does', async () => {
    const db = createFakeDb(seed());
    await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v-agr'] } }), db });
    await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'safe', title: 'Safeguarding Policy', body_html: '<p>safe v2</p>' } }), db });
    assert.equal((await handlers.me({ ...ctxFor(vol), db })).body.state.signature_status, 'signed');
    await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'agr', title: 'Volunteer Agreement', body_html: '<p>agreement v2</p>' } }), db });
    const s = (await handlers.me({ ...ctxFor(vol), db })).body.state;
    assert.equal(s.signature_status, 'outdated');
    assert.deepEqual(s.outdated_policies, ['Volunteer Agreement']);
});

test('policy-save and policy-retire can set the requires_signature flag; policies-admin reports it', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'Lone Working', body_html: '<p>x</p>', requires_signature: false } }), db });
    assert.equal(r.body.policy.requires_signature, false);
    const t = await handlers['policy-retire']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'safe', is_active: true, requires_signature: true } }), db });
    assert.equal(t.body.policy.requires_signature, true);
    const list = await handlers['policies-admin']({ ...ctxFor(admin), db });
    assert.equal(list.body.policies.find(p => p.id === 'safe').requires_signature, true);
});

test('registration state with no documents to sign is signed-complete once details and photo are done', () => {
    const s = computeRegistrationState(full, null, [], NOW);
    assert.equal(s.signature_status, 'none');
    assert.equal(s.registration_complete, false);
});
