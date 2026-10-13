const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, other, ctxFor } = require('./helpers/fixtures');

function fakeJpeg(width, height) {
    const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, (height >> 8) & 0xFF, height & 0xFF, (width >> 8) & 0xFF, width & 0xFF, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    return Buffer.concat([Buffer.from([0xFF, 0xD8]), sof, Buffer.from([0xFF, 0xD9])]).toString('base64');
}
const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, volunteer_number: 8 };

test('upload-photo stores a valid square jpeg on own record and sets photo_updated_at', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body: { photo: 'data:image/jpeg;base64,' + fakeJpeg(400, 400) } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.has_photo, true);
    assert.equal(r.body.state.photo_complete, true);
    assert.ok(db._users.get('u1').photo_data.length > 10);
    assert.ok(db._users.get('u1').photo_updated_at);
});

test('upload-photo rejects png and non-square and leaves existing photo alone', async () => {
    const db = createFakeDb({ users: [{ ...vol, photo_data: 'OLD', photo_updated_at: '2026-01-01T00:00:00Z' }] });
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).toString('base64');
    for (const photo of [png, fakeJpeg(1200, 800)]) {
        const r = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body: { photo } }), db });
        assert.equal(r.status, 400);
        assert.equal(db._users.get('u1').photo_data, 'OLD');
    }
});

test('volunteer cannot upload for another user; admin can', async () => {
    const db = createFakeDb({ users: [vol, other, admin] });
    const body = { photo: fakeJpeg(200, 200), user_id: 'u2' };
    const r1 = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body }), db });
    assert.equal(r1.status, 403);
    const r2 = await handlers['upload-photo']({ ...ctxFor(admin, { method: 'POST', body }), db });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.user.id, 'u2');
});

test('delete-photo clears photo and timestamp', async () => {
    const db = createFakeDb({ users: [{ ...vol, photo_data: 'OLD', photo_updated_at: '2026-01-01T00:00:00Z' }] });
    const r = await handlers['delete-photo']({ ...ctxFor(vol, { method: 'POST' }), db });
    assert.equal(r.status, 200);
    assert.equal(db._users.get('u1').photo_data, null);
    assert.equal(db._users.get('u1').photo_updated_at, null);
    assert.equal(r.body.state.photo_complete, false);
});

test('photo download: team lead gets jpeg bytes with attachment header; volunteer gets own only', async () => {
    const b64 = fakeJpeg(400, 400);
    const db = createFakeDb({ users: [{ ...vol, photo_data: b64, photo_updated_at: '2026-01-01T00:00:00Z' }, other, lead] });
    const r = await handlers.photo({ ...ctxFor(lead, { query: { id: 'u1' } }), db });
    assert.equal(r.status, 200);
    assert.ok(Buffer.isBuffer(r.raw));
    assert.equal(r.headers['Content-Type'], 'image/jpeg');
    assert.match(r.headers['Content-Disposition'], /attachment; filename="HAUK-0001-sarah-mitchell.jpg"/);
    const own = await handlers.photo({ ...ctxFor(vol, { query: { id: 'u1' } }), db });
    assert.equal(own.status, 200);
    const denied = await handlers.photo({ ...ctxFor(other, { query: { id: 'u1' } }), db });
    assert.equal(denied.status, 403);
    const none = await handlers.photo({ ...ctxFor(lead, { query: { id: 'u2' } }), db });
    assert.equal(none.status, 404);
});
