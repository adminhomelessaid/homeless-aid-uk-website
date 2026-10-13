const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHtml } = require('../utils/sanitize-html');
const { handlers, dispatch, resolveAction } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };

test('sanitiser strips tags whose names the browser accepts but the allowlist does not', () => {
    assert.equal(sanitizeHtml('<x_y onmouseover=alert(1) style=display:block>hover</x_y>'), 'hover');
    assert.equal(sanitizeHtml('<a_ href=javascript:alert(1) onclick=alert(1)>l</a_>'), 'l');
    assert.equal(sanitizeHtml('<p>5 < 6 and <b>bold</b></p>'), '<p>5 &lt; 6 and <b>bold</b></p>');
    assert.equal(sanitizeHtml('<svg/onload=alert(1)>'), '');
});

test('csv export neutralises formula cells, keeps phone leading zeros, starts with a BOM', async () => {
    const db = createFakeDb({ users: [admin, { ...vol, next_of_kin_name: '=HYPERLINK("http://x")', mobile_phone: '07700 900123', full_name: '+Sarah' }] });
    const r = await handlers.export({ ...ctxFor(admin), db });
    assert.ok(r.raw.startsWith('\uFEFF'), 'BOM');
    const row = r.raw.split('\n').find(l => l.includes('Sarah'));
    assert.ok(row.includes(`"'=HYPERLINK(""http://x"")"`), row);
    assert.ok(row.includes(`'+Sarah`), row);
    assert.ok(row.includes(`"=""07700 900123"""`), row);
});

test('dispatch uses the role and name stored in the database, not the token', async () => {
    const db = createFakeDb({ users: [{ ...admin, role: 'volunteer' }] });
    const r = await dispatch('volunteers', { ...ctxFor(admin), db });
    assert.equal(r.status, 403);
});

test('admin cannot change their own role', async () => {
    const db = createFakeDb({ users: [admin, vol] });
    const r = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1', role: 'volunteer' } }), db });
    assert.equal(r.status, 400);
    assert.equal(db._users.get('a1').role, 'admin');
    const ok = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1', mobile_phone: '07700900000' } }), db });
    assert.equal(ok.status, 200);
});

test('resolveAction reads the Vercel-parsed query first, then the URL, then the body, then a /ping path', () => {
    assert.equal(resolveAction({ query: { action: 'me' }, url: '/api/registration/ping' }, {}, {}), 'me');
    assert.equal(resolveAction({ query: {}, url: '/api/registration?action=sign' }, { action: 'sign' }, {}), 'sign');
    assert.equal(resolveAction({ query: {}, url: '/api/registration' }, {}, { action: 'block' }), 'block');
    assert.equal(resolveAction({ query: {}, url: '/api/registration/ping' }, {}, {}), 'ping');
    assert.equal(resolveAction({ url: '/api/registration' }, {}, {}), undefined);
});
