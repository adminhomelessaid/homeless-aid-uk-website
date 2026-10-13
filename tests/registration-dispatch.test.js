const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatch } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

test('dispatch refuses every action except ping for a blocked user', async () => {
    const db = createFakeDb({ users: [{ ...vol, is_active: false }] });
    const r = await dispatch('me', { ...ctxFor(vol), db });
    assert.equal(r.status, 403);
    assert.match(r.body.message, /blocked/i);
    const p = await dispatch('ping', { db, user: null, method: 'GET', query: {}, body: {} });
    assert.equal(p.status, 200);
});

test('dispatch refuses a token whose user no longer exists', async () => {
    const db = createFakeDb({ users: [] });
    const r = await dispatch('me', { ...ctxFor(vol), db });
    assert.equal(r.status, 401);
});

test('dispatch passes active users through to the handler', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await dispatch('me', { ...ctxFor(vol), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'u1');
});

test('dispatch returns 404 for unknown and prototype actions', async () => {
    const db = createFakeDb({ users: [vol] });
    assert.equal((await dispatch('nope', { ...ctxFor(vol), db })).status, 404);
    assert.equal((await dispatch('constructor', { ...ctxFor(vol), db })).status, 404);
});
