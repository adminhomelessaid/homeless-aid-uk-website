const test = require('node:test');
const assert = require('node:assert/strict');

test('invitation email helper exports a function', () => {
    const { sendInvitationEmail } = require('../utils/send-invitation-email');
    assert.equal(typeof sendInvitationEmail, 'function');
});
