const test = require('node:test');
const assert = require('node:assert/strict');
const { POLICY_FILES, planInserts } = require('../scripts/seed-policies');

test('POLICY_FILES lists the six initial policies in display order with slugs', () => {
    assert.deepEqual(POLICY_FILES.map(p => p.slug), ['volunteer-expectations', 'safeguarding', 'data-protection', 'equal-opportunities', 'complaints-procedure', 'soup-kitchen-risk-assessment']);
});

test('planInserts skips slugs that already exist and keeps order numbers', () => {
    const existing = [{ slug: 'safeguarding' }];
    const plan = planInserts(POLICY_FILES, existing);
    assert.equal(plan.find(p => p.slug === 'safeguarding'), undefined);
    assert.equal(plan.find(p => p.slug === 'volunteer-expectations').sort_order, 1);
    assert.equal(plan.find(p => p.slug === 'data-protection').sort_order, 3);
});
