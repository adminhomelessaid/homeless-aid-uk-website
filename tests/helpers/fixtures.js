const NOW = new Date('2026-10-13T10:00:00Z');
const vol = { id: 'u1', username: 'sarah', email: 's@x.org', full_name: 'Sarah Mitchell', role: 'volunteer', is_active: true, created_at: '2026-01-01T00:00:00Z', volunteer_number: 1 };
const other = { id: 'u2', username: 'james', email: 'j@x.org', full_name: 'James K', role: 'volunteer', is_active: true, created_at: '2026-01-02T00:00:00Z', volunteer_number: 2 };

function ctxFor(user, overrides = {}) {
    return { user: { id: user.id, role: user.role, name: user.full_name, username: user.username, email: user.email }, method: 'GET', query: {}, body: {}, ip: '1.2.3.4', userAgent: 'test', now: NOW, ...overrides };
}

module.exports = { NOW, vol, other, ctxFor };
