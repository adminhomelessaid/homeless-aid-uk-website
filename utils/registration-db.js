const USER_PUBLIC_FIELDS = 'id, username, email, full_name, role, is_active, email_verified, created_at, last_login, date_of_birth, mobile_phone, team, next_of_kin_name, next_of_kin_phone, photo_updated_at, volunteer_number';
const POLICY_FIELDS = 'id, slug, title, sort_order, is_active, created_at';
const VERSION_FIELDS = 'id, policy_id, version, body_html, change_note, created_at, created_by';
const SIGNATURE_FIELDS = 'id, user_id, typed_name, signed_at, expires_at, version_ids, ip_address, user_agent';

function must({ data, error }) {
    if (error) throw new Error(error.message || String(error));
    return data;
}

function createRegistrationDb(supabase) {
    const shapeUser = (row, withPhoto) => {
        if (!row) return null;
        const { photo_data, ...rest } = row;
        const out = { ...rest, has_photo: Boolean(row.photo_updated_at) };
        if (withPhoto) out.photo_data = photo_data || null;
        return out;
    };

    async function attachCurrentVersions(policies) {
        if (policies.length === 0) return [];
        const ids = policies.map(p => p.id);
        const versions = must(await supabase.from('policy_versions').select(VERSION_FIELDS).in('policy_id', ids).order('version', { ascending: false }));
        const latest = new Map();
        for (const v of versions) if (!latest.has(v.policy_id)) latest.set(v.policy_id, v);
        return policies.map(p => ({ ...p, current_version: latest.get(p.id) || null }));
    }

    return {
        async ping() { must(await supabase.from('policies').select('id').limit(1)); return true; },

        async getUserById(id, { withPhoto = false } = {}) {
            const fields = withPhoto ? `${USER_PUBLIC_FIELDS}, photo_data` : USER_PUBLIC_FIELDS;
            const { data, error } = await supabase.from('outreach_users').select(fields).eq('id', id).maybeSingle();
            if (error) throw new Error(error.message);
            return shapeUser(data, withPhoto);
        },
        async updateUser(id, fields) {
            const data = must(await supabase.from('outreach_users').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select(USER_PUBLIC_FIELDS).single());
            return shapeUser(data, false);
        },
        async listUsers() {
            const rows = must(await supabase.from('outreach_users').select(USER_PUBLIC_FIELDS).order('full_name'));
            return rows.map(r => shapeUser(r, false));
        },
        async deleteUser(id) { must(await supabase.from('outreach_users').delete().eq('id', id)); },

        async listActivePolicies() {
            const rows = must(await supabase.from('policies').select(POLICY_FIELDS).eq('is_active', true).order('sort_order'));
            return attachCurrentVersions(rows);
        },
        async listAllPolicies() {
            const rows = must(await supabase.from('policies').select(POLICY_FIELDS).order('sort_order'));
            return attachCurrentVersions(rows);
        },
        async getPolicyById(id) {
            const { data, error } = await supabase.from('policies').select(POLICY_FIELDS).eq('id', id).maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) return null;
            return (await attachCurrentVersions([data]))[0];
        },
        async insertPolicy(fields) { return must(await supabase.from('policies').insert([fields]).select(POLICY_FIELDS).single()); },
        async updatePolicy(id, fields) { return must(await supabase.from('policies').update(fields).eq('id', id).select(POLICY_FIELDS).single()); },
        async insertPolicyVersion(fields) { return must(await supabase.from('policy_versions').insert([fields]).select(VERSION_FIELDS).single()); },

        async getLatestSignature(userId) {
            const rows = must(await supabase.from('policy_signatures').select(SIGNATURE_FIELDS).eq('user_id', userId).order('signed_at', { ascending: false }).limit(1));
            return rows[0] || null;
        },
        async listSignatures(userId) {
            return must(await supabase.from('policy_signatures').select(SIGNATURE_FIELDS).eq('user_id', userId).order('signed_at', { ascending: false }));
        },
        async insertSignature(fields) { return must(await supabase.from('policy_signatures').insert([fields]).select(SIGNATURE_FIELDS).single()); },
        async listLatestSignaturesByUser() {
            const rows = must(await supabase.from('policy_signatures').select('user_id, signed_at, expires_at, version_ids').order('signed_at', { ascending: false }));
            const m = new Map();
            for (const r of rows) if (!m.has(r.user_id)) m.set(r.user_id, r);
            return m;
        }
    };
}

module.exports = { createRegistrationDb, USER_PUBLIC_FIELDS };
