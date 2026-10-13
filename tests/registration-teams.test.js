const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers, validateDetails, parseTeams } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const base = { date_of_birth: '1990-05-04', mobile_phone: '07700900000', next_of_kin_name: 'Tom', next_of_kin_phone: '07700900001' };

test('parseTeams accepts an array or a comma list, trims, dedupes and keeps the canonical order', () => {
    assert.deepEqual(parseTeams(['Bury', 'Bolton', 'Bury']), ['Bolton', 'Bury']);
    assert.deepEqual(parseTeams(' Oldham ,Wigan'), ['Wigan', 'Oldham']);
    assert.deepEqual(parseTeams(['Leigh']), null, 'Leigh is no longer a team');
    assert.deepEqual(parseTeams(''), []);
    assert.deepEqual(parseTeams(['Mars']), null);
});

test('validateDetails stores several teams as a comma list and requires at least one', () => {
    const ok = validateDetails({ ...base, team: ['Bolton', 'Bury'] });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.fields.team, 'Bolton, Bury');
    const single = validateDetails({ ...base, team: 'Oldham' });
    assert.equal(single.fields.team, 'Oldham');
    assert.ok(validateDetails({ ...base, team: [] }).errors.some(e => /team/i.test(e)));
    assert.ok(validateDetails({ ...base, team: ['Bolton', 'Mars'] }).errors.some(e => /team/i.test(e)));
});

test('update-me saves multiple teams and me returns them as a list', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers['update-me']({ ...ctxFor(vol, { method: 'POST', body: { ...base, team: ['Glasgow', 'Bolton'] } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.team, 'Bolton, Glasgow');
    assert.deepEqual(r.body.user.teams, ['Bolton', 'Glasgow']);
    const m = await handlers.me({ ...ctxFor(vol), db });
    assert.deepEqual(m.body.user.teams, ['Bolton', 'Glasgow']);
});
