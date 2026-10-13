const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePhoto, readJpegSize } = require('../utils/jpeg');

// Minimal JPEG: SOI, a SOF0 segment declaring the size, EOI. Enough for readJpegSize.
function fakeJpeg(width, height, padTo = 0) {
    const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, (height >> 8) & 0xFF, height & 0xFF, (width >> 8) & 0xFF, width & 0xFF, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    let buf = Buffer.concat([Buffer.from([0xFF, 0xD8]), sof, Buffer.from([0xFF, 0xD9])]);
    if (padTo > buf.length) buf = Buffer.concat([buf, Buffer.alloc(padTo - buf.length)]);
    return buf;
}

test('readJpegSize reads SOF0 dimensions', () => {
    assert.deepEqual(readJpegSize(fakeJpeg(400, 400)), { width: 400, height: 400 });
});

test('accepts a square 400px jpeg as plain base64 and as data url', () => {
    const b64 = fakeJpeg(400, 400).toString('base64');
    assert.equal(validatePhoto(b64).ok, true);
    assert.equal(validatePhoto('data:image/jpeg;base64,' + b64).ok, true);
});

test('rejects non-jpeg bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).toString('base64');
    const r = validatePhoto(png);
    assert.equal(r.ok, false);
    assert.match(r.message, /JPEG/);
});

test('rejects non-square and oversized dimensions', () => {
    assert.equal(validatePhoto(fakeJpeg(1200, 800).toString('base64')).ok, false);
    assert.equal(validatePhoto(fakeJpeg(800, 800).toString('base64')).ok, false);
});

test('rejects more than 300 KB', () => {
    const r = validatePhoto(fakeJpeg(400, 400, 307201).toString('base64'));
    assert.equal(r.ok, false);
    assert.match(r.message, /300 KB/);
});

test('rejects empty or garbage input', () => {
    assert.equal(validatePhoto('').ok, false);
    assert.equal(validatePhoto('not base64!!').ok, false);
});
