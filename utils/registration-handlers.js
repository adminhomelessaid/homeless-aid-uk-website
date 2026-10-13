const { computeRegistrationState, normaliseName, addMonths } = require('./registration-state');
const { sanitizeHtml } = require('./sanitize-html');
const { validatePhoto } = require('./jpeg');

const TEAMS = ['Bolton', 'Manchester', 'Bury', 'Liverpool', 'Wigan', 'Oldham', 'Glasgow', 'Leigh', 'Other'];
const ROLES = ['admin', 'team_lead', 'volunteer'];

const ok = (body) => ({ status: 200, body: { success: true, ...body } });
const fail = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });
const requirePost = (ctx) => ctx.method === 'POST' ? null : fail(405, 'Method not allowed');
const requireRole = (ctx, roles) => roles.includes(ctx.user.role) ? null : fail(403, 'You do not have permission to do that');

function policySummary(p) {
    return {
        id: p.id, slug: p.slug, title: p.title, sort_order: p.sort_order, is_active: p.is_active,
        current_version: p.current_version ? { id: p.current_version.id, version: p.current_version.version, change_note: p.current_version.change_note, created_at: p.current_version.created_at } : null
    };
}

async function stateFor(db, user, now) {
    const [policies, sig] = await Promise.all([db.listActivePolicies(), db.getLatestSignature(user.id)]);
    const active = policies.filter(p => p.current_version);
    return { policies: active, state: computeRegistrationState(user, sig, active, now) };
}

function validateDetails(body) {
    const out = {};
    const errors = [];
    const dob = String(body.date_of_birth || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) errors.push('Date of birth must be a valid date');
    else if (new Date(dob) > new Date()) errors.push('Date of birth cannot be in the future');
    else out.date_of_birth = dob;

    const phone = (v) => String(v || '').trim();
    const phoneOk = (v) => /^\+?[0-9 ()-]{7,20}$/.test(v);
    const mob = phone(body.mobile_phone);
    if (!phoneOk(mob)) errors.push('Mobile number must be a valid phone number'); else out.mobile_phone = mob;
    const nokPhone = phone(body.next_of_kin_phone);
    if (!phoneOk(nokPhone)) errors.push('Next of kin phone must be a valid phone number'); else out.next_of_kin_phone = nokPhone;

    const team = String(body.team || '').trim();
    if (!TEAMS.includes(team)) errors.push('Please choose a team'); else out.team = team;

    const nok = String(body.next_of_kin_name || '').trim();
    if (nok.length < 2 || nok.length > 100) errors.push('Next of kin name is required'); else out.next_of_kin_name = nok;

    return { fields: out, errors };
}

const handlers = {
    async ping({ db }) {
        await db.ping();
        return ok({ ok: true });
    },

    async me(ctx) {
        const user = await ctx.db.getUserById(ctx.user.id);
        if (!user) return fail(404, 'User not found');
        const { policies, state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user, state, policies: policies.map(policySummary), teams: TEAMS });
    },

    async 'update-me'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const { fields, errors } = validateDetails(ctx.body || {});
        if (errors.length) return fail(400, errors.join('. '));
        const user = await ctx.db.updateUser(ctx.user.id, fields);
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user, state });
    }
};

function targetUserId(ctx) {
    // Volunteers and team leads act on themselves; admins may name another user.
    const requested = ctx.body?.user_id || ctx.query?.user_id;
    if (!requested || requested === ctx.user.id) return { id: ctx.user.id };
    if (ctx.user.role !== 'admin') return { error: fail(403, 'You can only change your own record') };
    return { id: requested };
}

function photoFilename(user) {
    const num = String(user.volunteer_number || 0).padStart(4, '0');
    const name = normaliseName(user.full_name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'volunteer';
    return `HAUK-${num}-${name}.jpg`;
}

Object.assign(handlers, {
    async 'upload-photo'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const t = targetUserId(ctx); if (t.error) return t.error;
        const v = validatePhoto(ctx.body.photo);
        if (!v.ok) return fail(400, v.message);
        const existing = await ctx.db.getUserById(t.id);
        if (!existing) return fail(404, 'User not found');
        const user = await ctx.db.updateUser(t.id, { photo_data: v.buffer.toString('base64'), photo_updated_at: ctx.now.toISOString() });
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user, state });
    },

    async 'delete-photo'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const t = targetUserId(ctx); if (t.error) return t.error;
        const user = await ctx.db.updateUser(t.id, { photo_data: null, photo_updated_at: null });
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user, state });
    },

    async photo(ctx) {
        const id = ctx.query.id;
        if (!id) return fail(400, 'id is required');
        if (id !== ctx.user.id) { const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return r; }
        const user = await ctx.db.getUserById(id, { withPhoto: true });
        if (!user || !user.photo_data) return fail(404, 'No photo for this user');
        return {
            status: 200,
            raw: Buffer.from(user.photo_data, 'base64'),
            headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${photoFilename(user)}"`, 'Cache-Control': 'private, no-store' }
        };
    }
});

Object.assign(handlers, {
    async policies(ctx) {
        const user = await ctx.db.getUserById(ctx.user.id);
        if (!user) return fail(404, 'User not found');
        const { policies, state } = await stateFor(ctx.db, user, ctx.now);
        const full = policies.map(p => ({ ...policySummary(p), current_version: { ...policySummary(p).current_version, body_html: p.current_version.body_html } }));
        return ok({ policies: full, state });
    },

    async sign(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const user = await ctx.db.getUserById(ctx.user.id);
        if (!user) return fail(404, 'User not found');
        if (!user.is_active) return fail(403, 'This account is blocked');

        const typed = String(ctx.body.typed_name || '').trim();
        if (normaliseName(typed) !== normaliseName(user.full_name)) {
            return fail(400, `Please type your name exactly as it appears on your account: ${user.full_name}`);
        }

        const { policies } = await stateFor(ctx.db, user, ctx.now);
        if (policies.length === 0) return fail(400, 'There are no policies to sign yet');

        const sent = new Set(Array.isArray(ctx.body.version_ids) ? ctx.body.version_ids.map(String) : []);
        const current = new Set(policies.map(p => p.current_version.id));
        const outdated = policies.filter(p => !sent.has(p.current_version.id)).map(p => p.title);
        const unknown = [...sent].filter(id => !current.has(id));
        if (outdated.length || unknown.length) {
            return fail(409, 'The policies have changed since you opened this page. Please refresh, read the updated policies, and sign again.', { outdated_policies: outdated });
        }

        const signed_at = ctx.now.toISOString();
        const expires_at = addMonths(ctx.now, 12).toISOString();
        await ctx.db.insertSignature({ user_id: user.id, typed_name: typed, signed_at, expires_at, version_ids: [...current], ip_address: ctx.ip, user_agent: ctx.userAgent });
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ signature: { signed_at, expires_at }, state });
    }
});

module.exports = { handlers, TEAMS, ROLES, ok, fail, requirePost, requireRole, policySummary, stateFor, validateDetails, normaliseName, addMonths, sanitizeHtml, validatePhoto };
