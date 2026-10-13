const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRegistrationState, normaliseName, addMonths } = require('../utils/registration-state');

const now = new Date('2026-10-13T10:00:00Z');
const policies = [
    { id: 'p1', title: 'Safeguarding', current_version: { id: 'v1' } },
    { id: 'p2', title: 'Data Protection', current_version: { id: 'v2' } }
];
const fullUser = { date_of_birth: '1990-01-01', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'A', next_of_kin_phone: '0123', has_photo: true };

test('no signature gives none and incomplete', () => {
    const s = computeRegistrationState(fullUser, null, policies, now);
    assert.equal(s.signature_status, 'none');
    assert.equal(s.registration_complete, false);
    assert.equal(s.signature, null);
});

test('valid signature covering all current versions is signed and complete', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    const s = computeRegistrationState(fullUser, sig, policies, now);
    assert.equal(s.signature_status, 'signed');
    assert.equal(s.registration_complete, true);
    assert.deepEqual(s.signature, { signed_at: sig.signed_at, expires_at: sig.expires_at });
});

test('expired signature is expired even if versions match', () => {
    const sig = { signed_at: '2025-01-01T00:00:00Z', expires_at: '2026-01-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'expired');
});

test('re-versioned policy makes signature outdated and names the policy', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v-old'] };
    const s = computeRegistrationState(fullUser, sig, policies, now);
    assert.equal(s.signature_status, 'outdated');
    assert.deepEqual(s.outdated_policies, ['Data Protection']);
});

test('policy added after signing makes signature outdated', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'outdated');
});

test('retired policy does not affect a signature (only active policies passed in)', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2', 'v-retired'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'signed');
});

test('missing details or photo makes incomplete even when signed', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    const s = computeRegistrationState({ ...fullUser, next_of_kin_phone: '' }, sig, policies, now);
    assert.equal(s.details_complete, false);
    assert.equal(s.registration_complete, false);
    const s2 = computeRegistrationState({ ...fullUser, has_photo: false }, sig, policies, now);
    assert.equal(s2.photo_complete, false);
});

test('normaliseName trims, collapses spaces, lowercases', () => {
    assert.equal(normaliseName('  Sarah   Mitchell '), 'sarah mitchell');
});

test('addMonths adds 12 months', () => {
    assert.equal(addMonths(new Date('2026-10-13T10:00:00Z'), 12).toISOString(), '2027-10-13T10:00:00.000Z');
});
