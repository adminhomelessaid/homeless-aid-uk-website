const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers, dispatch } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 1 };
const friLead = { id: 'lf', username: 'fri', email: 'f@x.org', full_name: 'Friday Lead', role: 'team_lead', is_active: true, volunteer_number: 2 };
const satLead = { id: 'ls', username: 'sat', email: 's@x.org', full_name: 'Saturday Lead', role: 'team_lead', is_active: true, volunteer_number: 3 };
const teams = [
    { id: 't-fri', name: 'Bolton Friday', town: 'Bolton', day: 'Friday', sort_order: 1, is_active: true },
    { id: 't-sat', name: 'Bolton Saturday', town: 'Bolton', day: 'Saturday', sort_order: 2, is_active: true },
    { id: 't-old', name: 'Leigh Saturday', town: 'Leigh', day: 'Saturday', sort_order: 3, is_active: false }
];
const seed = (extra = []) => ({
    users: [admin, friLead, satLead,
        { id: 'v1', username: 'v1', email: 'v1@x.org', full_name: 'Friday Vol', role: 'volunteer', is_active: true, team: 'Bolton Friday', volunteer_number: 4 },
        { id: 'v2', username: 'v2', email: 'v2@x.org', full_name: 'Saturday Vol', role: 'volunteer', is_active: true, team: 'Bolton Saturday', volunteer_number: 5 },
        { id: 'p1', username: 'p1', email: 'p1@x.org', full_name: 'Pending Sat', role: 'volunteer', is_active: false, approval_status: 'pending', team: 'Bolton Saturday', volunteer_number: 6 },
        ...extra],
    teams,
    teamLeads: [{ team_id: 't-fri', user_id: 'lf' }, { team_id: 't-sat', user_id: 'ls' }, { team_id: 't-sat', user_id: 'lf' }]
});

test('team-list is public and returns active teams only, with town and day', async () => {
    const db = createFakeDb(seed());
    const r = await dispatch('team-list', { user: null, method: 'GET', query: {}, body: {}, db });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.teams.map(t => t.name), ['Bolton Friday', 'Bolton Saturday']);
    assert.equal(r.body.teams[0].town, 'Bolton');
});

test('details validate against the managed team list (retired and unknown teams refused)', async () => {
    const db = createFakeDb(seed());
    const base = { date_of_birth: '1990-01-01', mobile_phone: '07700900000', next_of_kin_name: 'NOK', next_of_kin_phone: '07700900001' };
    const ok = await dispatch('update-me', { ...ctxFor(friLead, { method: 'POST', body: { ...base, team: ['Bolton Saturday', 'Bolton Friday'] } }), db });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.team, 'Bolton Friday, Bolton Saturday');
    assert.equal((await dispatch('update-me', { ...ctxFor(friLead, { method: 'POST', body: { ...base, team: ['Leigh Saturday'] } }), db })).status, 400);
    assert.equal((await dispatch('update-me', { ...ctxFor(friLead, { method: 'POST', body: { ...base, team: ['Bolton'] } }), db })).status, 400);
});

test('My team follows the teams a person leads, so Friday and Saturday Bolton leads see different people', async () => {
    const db = createFakeDb(seed());
    const sat = await dispatch('volunteers', { ...ctxFor(satLead, { query: { scope: 'team' } }), db });
    assert.deepEqual(sat.body.volunteers.map(v => v.id), ['v2']);
    assert.deepEqual(sat.body.my_teams, ['Bolton Saturday']);
    const fri = await dispatch('volunteers', { ...ctxFor(friLead, { query: { scope: 'team' } }), db });
    assert.deepEqual(fri.body.volunteers.map(v => v.id).sort(), ['v1', 'v2'], 'leads both teams');
});

test('sign-up approvals go to the leads of the chosen team', async () => {
    const db = createFakeDb(seed());
    const sat = await dispatch('pending-signups', { ...ctxFor(satLead), db });
    assert.deepEqual(sat.body.pending.map(p => p.id), ['p1']);
    const other = createFakeDb({ ...seed(), teamLeads: [{ team_id: 't-fri', user_id: 'lf' }] });
    assert.deepEqual((await dispatch('pending-signups', { ...ctxFor(friLead), db: other })).body.pending, []);
});

test('teams action lists every team with its leads for staff; team-save is admin only', async () => {
    const db = createFakeDb(seed());
    const r = await dispatch('teams', { ...ctxFor(admin), db });
    const sat = r.body.teams.find(t => t.id === 't-sat');
    assert.deepEqual(sat.leads.map(l => l.id).sort(), ['lf', 'ls']);
    assert.equal(sat.member_count, 1);
    assert.equal(r.body.teams.length, 3, 'admins also see retired teams');
    assert.equal((await dispatch('team-save', { ...ctxFor(satLead, { method: 'POST', body: { name: 'X', town: 'Bolton' } }), db })).status, 403);
});

test('team-save creates a team with several leads, and renaming moves members to the new name', async () => {
    const db = createFakeDb(seed());
    const c = await dispatch('team-save', { ...ctxFor(admin, { method: 'POST', body: { name: 'Bury Monday', town: 'Bury', day: 'Monday', lead_ids: ['lf', 'ls'] } }), db });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual(c.body.team.leads.map(l => l.id).sort(), ['lf', 'ls']);
    const dup = await dispatch('team-save', { ...ctxFor(admin, { method: 'POST', body: { name: 'bolton friday', town: 'Bolton' } }), db });
    assert.equal(dup.status, 409);
    const ren = await dispatch('team-save', { ...ctxFor(admin, { method: 'POST', body: { team_id: 't-sat', name: 'Bolton Saturday Night', town: 'Bolton', day: 'Saturday', lead_ids: ['ls'] } }), db });
    assert.equal(ren.status, 200, JSON.stringify(ren.body));
    assert.equal(db._users.get('v2').team, 'Bolton Saturday Night');
    assert.equal(db._users.get('p1').team, 'Bolton Saturday Night');
    assert.deepEqual(ren.body.team.leads.map(l => l.id), ['ls']);
});
