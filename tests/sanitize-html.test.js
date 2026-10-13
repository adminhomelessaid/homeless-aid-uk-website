const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHtml } = require('../utils/sanitize-html');

test('keeps allowed tags and text', () => {
    assert.equal(sanitizeHtml('<h2>Title</h2><p>Hello <strong>bold</strong></p>'), '<h2>Title</h2><p>Hello <strong>bold</strong></p>');
});

test('removes script and style with content', () => {
    assert.equal(sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>'), '<p>a</p><p>b</p>');
});

test('strips disallowed tags but keeps their text', () => {
    assert.equal(sanitizeHtml('<div class="x"><span onclick="y()">text</span></div>'), 'text');
});

test('strips attributes except safe href on a', () => {
    assert.equal(sanitizeHtml('<a href="https://x.org" onclick="z()">l</a>'), '<a href="https://x.org">l</a>');
    assert.equal(sanitizeHtml('<a href="javascript:alert(1)">l</a>'), '<a>l</a>');
    assert.equal(sanitizeHtml('<p style="color:red">t</p>'), '<p>t</p>');
});

test('handles empty and non-string input', () => {
    assert.equal(sanitizeHtml(''), '');
    assert.equal(sanitizeHtml(null), '');
});
