const test = require('node:test');
const assert = require('node:assert/strict');
const AuthUtils = require('../utils/auth');

test('password needs 6+ characters with at least one letter and one number, nothing else', () => {
    for (const ok of ['rovers12', 'dorothy1', 'Bolton99', 'a1b2c3', 'Str0ng!pass']) assert.equal(AuthUtils.validatePassword(ok).valid, true, ok);
    for (const bad of ['', 'rove1', '123456', 'rovers', 'abcdef', 'ab 12']) assert.equal(AuthUtils.validatePassword(bad).valid, false, bad);
    assert.match(AuthUtils.validatePassword('123456').errors.join(' '), /letter/);
});
