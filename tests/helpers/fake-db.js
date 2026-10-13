// In-memory stand-in for utils/registration-db.js. Same method names and shapes.
function createFakeDb(seed = {}) {
    const users = new Map((seed.users || []).map(u => [u.id, { ...u }]));
    const policies = new Map((seed.policies || []).map(p => [p.id, { ...p }]));
    const versions = (seed.versions || []).map(v => ({ ...v }));
    const signatures = (seed.signatures || []).map(s => ({ ...s }));
    let idCounter = 1000;
    const nextId = () => `id-${idCounter++}`;

    const publicUser = (u, withPhoto) => {
        if (!u) return null;
        const { password_hash, invitation_token, photo_data, ...rest } = u;
        const out = { ...rest, has_photo: Boolean(photo_data) };
        if (withPhoto) out.photo_data = photo_data || null;
        return out;
    };
    const currentVersion = (policyId) => versions.filter(v => v.policy_id === policyId).sort((a, b) => b.version - a.version)[0] || null;
    const withVersion = (p) => ({ ...p, current_version: currentVersion(p.id) });
    const sortPolicies = (arr) => arr.sort((a, b) => a.sort_order - b.sort_order);

    return {
        calls: [],
        async ping() { return true; },
        async getUserById(id, { withPhoto = false } = {}) { return publicUser(users.get(id), withPhoto); },
        async updateUser(id, fields) {
            const u = users.get(id); if (!u) throw new Error('not found');
            Object.assign(u, fields, { updated_at: new Date().toISOString() });
            return publicUser(u, false);
        },
        async listUsers() { return [...users.values()].map(u => publicUser(u, false)); },
        async deleteUser(id) { this.calls.push(['deleteUser', id]); users.delete(id); },
        async findUserByEmail(email) { const e = String(email).toLowerCase(); return publicUser([...users.values()].find(u => String(u.email).toLowerCase() === e), false); },
        async findUserByUsername(username) { const n = String(username).toLowerCase(); return publicUser([...users.values()].find(u => String(u.username).toLowerCase() === n), false); },
        async insertUser(fields) {
            const row = { id: nextId(), created_at: new Date().toISOString(), volunteer_number: users.size + 1, ...fields };
            users.set(row.id, row); return publicUser(row, false);
        },
        async listActivePolicies() { return sortPolicies([...policies.values()].filter(p => p.is_active).map(withVersion)); },
        async listAllPolicies() { return sortPolicies([...policies.values()].map(withVersion)); },
        async getPolicyById(id) { const p = policies.get(id); return p ? withVersion(p) : null; },
        async insertPolicy({ slug, title, sort_order }) {
            const p = { id: nextId(), slug, title, sort_order, is_active: true, created_at: new Date().toISOString() };
            policies.set(p.id, p); return { ...p };
        },
        async updatePolicy(id, fields) { const p = policies.get(id); Object.assign(p, fields); return { ...p }; },
        async insertPolicyVersion(v) { const row = { id: nextId(), created_at: new Date().toISOString(), ...v }; versions.push(row); return { ...row }; },
        async getLatestSignature(userId) {
            return signatures.filter(s => s.user_id === userId).sort((a, b) => new Date(b.signed_at) - new Date(a.signed_at))[0] || null;
        },
        async listSignatures(userId) {
            return signatures.filter(s => s.user_id === userId).sort((a, b) => new Date(b.signed_at) - new Date(a.signed_at));
        },
        async insertSignature(s) { const row = { id: nextId(), ...s }; signatures.push(row); return { ...row }; },
        async listLatestSignaturesByUser() {
            const m = new Map();
            for (const s of signatures) {
                const cur = m.get(s.user_id);
                if (!cur || new Date(s.signed_at) > new Date(cur.signed_at)) m.set(s.user_id, s);
            }
            return m;
        },
        _users: users, _policies: policies, _versions: versions, _signatures: signatures
    };
}

module.exports = { createFakeDb };
