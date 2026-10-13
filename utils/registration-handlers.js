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

async function listWithState(db, now) {
    const [users, policies, latest] = await Promise.all([db.listUsers(), db.listActivePolicies(), db.listLatestSignaturesByUser()]);
    const active = policies.filter(p => p.current_version);
    return users.map(u => ({ ...u, state: computeRegistrationState(u, latest.get(u.id) || null, active, now) }));
}

function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function validatePartialDetails(body) {
    // Validate only the detail fields that are present. Reuses validateDetails rules.
    const present = {};
    for (const k of ['date_of_birth', 'mobile_phone', 'team', 'next_of_kin_name', 'next_of_kin_phone']) if (k in body) present[k] = body[k];
    if (Object.keys(present).length === 0) return { fields: {}, errors: [] };
    const filler = { date_of_birth: '2000-01-01', mobile_phone: '07000000000', team: TEAMS[0], next_of_kin_name: 'xx', next_of_kin_phone: '07000000000' };
    const { fields, errors } = validateDetails({ ...filler, ...present });
    const out = {};
    for (const k of Object.keys(present)) if (k in fields) out[k] = fields[k];
    return { fields: out, errors };
}

Object.assign(handlers, {
    async volunteers(ctx) {
        const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return r;
        const all = await listWithState(ctx.db, ctx.now);
        const counts = {
            total: all.length,
            complete: all.filter(v => v.state.registration_complete).length,
            needs_signing: all.filter(v => v.state.signature_status !== 'signed').length,
            incomplete: all.filter(v => !v.state.registration_complete).length,
            blocked: all.filter(v => !v.is_active).length
        };
        const q = normaliseName(ctx.query.q || '');
        const status = ctx.query.status || '';
        const role = ctx.query.role || '';
        const volunteers = all.filter(v => {
            if (q && !normaliseName(`${v.full_name} ${v.email} ${v.username}`).includes(q)) return false;
            if (role && v.role !== role) return false;
            if (status === 'blocked') return !v.is_active;
            if (status === 'complete') return v.state.registration_complete;
            if (status === 'incomplete') return !v.state.registration_complete;
            if (status === 'needs_signing') return v.state.signature_status !== 'signed';
            return true;
        });
        return ok({ volunteers, counts });
    },

    async volunteer(ctx) {
        const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return r;
        const user = await ctx.db.getUserById(ctx.query.id);
        if (!user) return fail(404, 'Volunteer not found');
        const [{ policies, state }, signatures] = await Promise.all([stateFor(ctx.db, user, ctx.now), ctx.db.listSignatures(user.id)]);
        return ok({ user, state, policies: policies.map(policySummary), signatures });
    },

    async 'admin-update-volunteer'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const body = ctx.body || {};
        const target = await ctx.db.getUserById(body.user_id);
        if (!target) return fail(404, 'Volunteer not found');
        const fields = {};
        const errors = [];
        if ('full_name' in body) { const n = String(body.full_name || '').trim(); if (n.length < 2 || n.length > 100) errors.push('Full name must be 2 to 100 characters'); else fields.full_name = n; }
        if ('email' in body) { const e = String(body.email || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.push('Email is not valid'); else fields.email = e; }
        if ('role' in body) { if (!ROLES.includes(body.role)) errors.push('Invalid role'); else fields.role = body.role; }
        const d = validatePartialDetails(body);
        errors.push(...d.errors);
        Object.assign(fields, d.fields);
        if (errors.length) return fail(400, errors.join('. '));
        if (Object.keys(fields).length === 0) return fail(400, 'Nothing to update');
        const user = await ctx.db.updateUser(target.id, fields);
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user, state });
    },

    async block(ctx) { return setActive(ctx, false); },
    async unblock(ctx) { return setActive(ctx, true); },

    async 'delete-volunteer'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const { user_id, confirm_name } = ctx.body || {};
        if (!user_id) return fail(400, 'user_id is required');
        if (user_id === ctx.user.id) return fail(400, 'You cannot delete your own account');
        const target = await ctx.db.getUserById(user_id);
        if (!target) return fail(404, 'Volunteer not found');
        if (normaliseName(confirm_name) !== normaliseName(target.full_name)) return fail(400, 'Type the volunteer\'s full name exactly to confirm deletion');
        await ctx.db.deleteUser(user_id);
        console.log(`Volunteer deleted: ${target.username} (${target.id}) by ${ctx.user.username} (${ctx.user.id})`);
        return ok({});
    },

    async export(ctx) {
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const all = await listWithState(ctx.db, ctx.now);
        const header = ['volunteer_number','full_name','email','role','team','mobile_phone','date_of_birth','next_of_kin_name','next_of_kin_phone','is_active','details_complete','photo_complete','signature_status','signed_at','expires_at'];
        const rows = all.map(v => [v.volunteer_number, v.full_name, v.email, v.role, v.team, v.mobile_phone, v.date_of_birth, v.next_of_kin_name, v.next_of_kin_phone, v.is_active, v.state.details_complete, v.state.photo_complete, v.state.signature_status, v.state.signature?.signed_at || '', v.state.signature?.expires_at || ''].map(csvCell).join(','));
        const date = ctx.now.toISOString().slice(0, 10);
        return { status: 200, raw: [header.join(','), ...rows].join('\n'), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="volunteers-${date}.csv"` } };
    }
});

async function setActive(ctx, is_active) {
    const m = requirePost(ctx); if (m) return m;
    const r = requireRole(ctx, ['admin']); if (r) return r;
    const { user_id } = ctx.body || {};
    if (!user_id) return fail(400, 'user_id is required');
    if (user_id === ctx.user.id) return fail(400, 'You cannot change your own account status');
    const target = await ctx.db.getUserById(user_id);
    if (!target) return fail(404, 'Volunteer not found');
    const user = await ctx.db.updateUser(user_id, { is_active });
    return ok({ user });
}

function slugify(s) {
    return normaliseName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function policyFull(p) {
    const s = policySummary(p);
    return { ...s, current_version: p.current_version ? { ...s.current_version, body_html: p.current_version.body_html, created_by: p.current_version.created_by } : null };
}

Object.assign(handlers, {
    async 'policies-admin'(ctx) {
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const all = await ctx.db.listAllPolicies();
        return ok({ policies: all.map(policyFull) });
    },

    async 'policy-save'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const body = ctx.body || {};
        const title = String(body.title || '').trim();
        if (title.length < 2 || title.length > 150) return fail(400, 'Title must be 2 to 150 characters');
        const html = sanitizeHtml(body.body_html);
        if (!html.replace(/<[^>]+>/g, '').trim()) return fail(400, 'Policy text cannot be empty');
        const change_note = String(body.change_note || '').trim().slice(0, 300) || null;

        let policy;
        let nextVersion = 1;
        if (body.policy_id) {
            policy = await ctx.db.getPolicyById(body.policy_id);
            if (!policy) return fail(404, 'Policy not found');
            nextVersion = (policy.current_version?.version || 0) + 1;
            if (policy.title !== title) policy = { ...policy, ...(await ctx.db.updatePolicy(policy.id, { title })) };
        } else {
            const slug = slugify(body.slug || title);
            if (!slug) return fail(400, 'Could not make a slug from the title');
            const all = await ctx.db.listAllPolicies();
            if (all.some(p => p.slug === slug)) return fail(409, `A policy with the slug "${slug}" already exists`);
            const sort_order = all.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1;
            policy = await ctx.db.insertPolicy({ slug, title, sort_order });
        }
        const version = await ctx.db.insertPolicyVersion({ policy_id: policy.id, version: nextVersion, body_html: html, change_note, created_by: ctx.user.id });
        return ok({ policy: policyFull({ ...policy, current_version: version }) });
    },

    async 'policy-reorder'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const order = Array.isArray(ctx.body?.order) ? ctx.body.order : [];
        if (order.length === 0) return fail(400, 'order is required');
        for (let i = 0; i < order.length; i++) await ctx.db.updatePolicy(order[i], { sort_order: i + 1 });
        return ok({});
    },

    async 'policy-retire'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        const { policy_id, is_active } = ctx.body || {};
        const existing = await ctx.db.getPolicyById(policy_id);
        if (!existing) return fail(404, 'Policy not found');
        const row = await ctx.db.updatePolicy(policy_id, { is_active: Boolean(is_active) });
        return ok({ policy: policyFull({ ...existing, ...row }) });
    }
});

// Single entry point used by the API function: unknown actions 404, blocked or deleted users are refused
// on every action except ping, then the handler runs.
async function dispatch(action, ctx) {
    const handler = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : null;
    if (!handler) return fail(404, `Unknown action: ${action}`);
    if (action !== "ping") {
        const row = await ctx.db.getUserById(ctx.user.id);
        if (!row) return fail(401, "This account no longer exists. Please log in again.");
        if (!row.is_active) return fail(403, "This account is blocked. Please contact an administrator.");
    }
    return handler(ctx);
}

module.exports = { handlers, dispatch, TEAMS, ROLES, ok, fail, requirePost, requireRole, policySummary, stateFor, validateDetails, normaliseName, addMonths, sanitizeHtml, validatePhoto };
