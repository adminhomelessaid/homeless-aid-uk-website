const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { ctxFor } = require('./helpers/fixtures');

const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, team: 'Bolton, Bury', volunteer_number: 1 };
const users = [lead,
    { id: 'v1', username: 'v1', email: 'v1@x.org', full_name: 'Bolton Vol', role: 'volunteer', is_active: true, team: 'Bolton', volunteer_number: 2 },
    { id: 'v2', username: 'v2', email: 'v2@x.org', full_name: 'Wigan Vol', role: 'volunteer', is_active: true, team: 'Wigan', volunteer_number: 3 },
    { id: 'v3', username: 'v3', email: 'v3@x.org', full_name: 'Bury Glasgow Vol', role: 'volunteer', is_active: true, team: 'Bury, Glasgow', volunteer_number: 4 },
    { id: 'v4', username: 'v4', email: 'v4@x.org', full_name: 'No Team', role: 'volunteer', is_active: true, volunteer_number: 5 }];

test('scope=team returns only volunteers sharing a team with the team lead, counts follow the scope', async () => {
    const db = createFakeDb({ users });
    const r = await handlers.volunteers({ ...ctxFor(lead, { query: { scope: 'team' } }), db });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.volunteers.map(v => v.id).sort(), ['l1', 'v1', 'v3']);
    assert.equal(r.body.counts.total, 3);
    assert.deepEqual(r.body.my_teams, ['Bolton', 'Bury']);
});

test('without scope a team lead still sees everyone', async () => {
    const db = createFakeDb({ users });
    const r = await handlers.volunteers({ ...ctxFor(lead), db });
    assert.equal(r.body.volunteers.length, 5);
});
