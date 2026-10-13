const { computeRegistrationState, normaliseName, addMonths } = require('./registration-state');
const { sanitizeHtml } = require('./sanitize-html');
const { validatePhoto } = require('./jpeg');

// Fallback team list, used only when the managed `teams` table is empty (and in unit tests).
// dispatch() replaces it with the active team names from the database on every request.
const DEFAULT_TEAMS = ['Bolton', 'Manchester', 'Bury', 'Liverpool', 'Wigan', 'Oldham', 'Glasgow', 'Other'];
let TEAMS = DEFAULT_TEAMS;
let TEAM_ROWS = [];

// A volunteer can belong to several teams. Stored as a comma list in outreach_users.team; exposed as `teams`.
function parseTeams(input) {
    const raw = Array.isArray(input) ? input : String(input || '').split(',');
    const names = raw.map(t => String(t || '').trim()).filter(Boolean);
    if (names.some(t => !TEAMS.includes(t))) return null;
    return [...new Set(names)].sort((a, b) => TEAMS.indexOf(a) - TEAMS.indexOf(b));
}
function withTeams(user) { return user ? { ...user, teams: parseTeams(user.team) || [] } : user; }
const ROLES = ['admin', 'team_lead', 'volunteer'];

const ok = (body) => ({ status: 200, body: { success: true, ...body } });
const fail = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });
const requirePost = (ctx) => ctx.method === 'POST' ? null : fail(405, 'Method not allowed');
const requireRole = (ctx, roles) => roles.includes(ctx.user.role) ? null : fail(403, 'You do not have permission to do that');

function policySummary(p) {
    return {
        id: p.id, slug: p.slug, title: p.title, sort_order: p.sort_order, is_active: p.is_active,
        requires_signature: p.requires_signature !== false,
        current_version: p.current_version ? { id: p.current_version.id, version: p.current_version.version, change_note: p.current_version.change_note, created_at: p.current_version.created_at } : null
    };
}

// Only documents flagged requires_signature form the declaration; the rest are reference reading.
const needsSignature = (p) => p.requires_signature !== false;

async function stateFor(db, user, now) {
    const [policies, sig] = await Promise.all([db.listActivePolicies(), db.getLatestSignature(user.id)]);
    const active = policies.filter(p => p.current_version);
    const signable = active.filter(needsSignature);
    return { policies: active, signable, state: computeRegistrationState(user, sig, signable, now) };
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

    const teams = parseTeams(body.team);
    if (!teams || teams.length === 0) errors.push('Please choose at least one team'); else out.team = teams.join(', ');

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
        const { policies, signable, state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user: withTeams(user), state, policies: policies.map(policySummary), to_sign: signable.map(policySummary), teams: TEAMS, team_options: teamOptions() });
    },

    async 'update-me'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const { fields, errors } = validateDetails(ctx.body || {});
        if (errors.length) return fail(400, errors.join('. '));
        const user = await ctx.db.updateUser(ctx.user.id, fields);
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user: withTeams(user), state });
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

        const { signable: policies } = await stateFor(ctx.db, user, ctx.now);
        if (policies.length === 0) return fail(400, 'There is nothing to sign yet');

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
    const signable = policies.filter(p => p.current_version && needsSignature(p));
    return users.map(u => ({ ...withTeams(u), state: computeRegistrationState(u, latest.get(u.id) || null, signable, now) }));
}

function csvCell(v, { phone = false } = {}) {
    let s = v === null || v === undefined ? '' : String(v);
    // Phone numbers as a constant formula so spreadsheets keep the leading 0.
    if (phone && s) return `"=""${s.replace(/"/g, '')}"""`;
    // Neutralise anything a spreadsheet would run as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
        const everyone = await listWithState(ctx.db, ctx.now);
        let all = everyone.filter(v => v.approval_status !== 'pending');
        // "My team": only people who share at least one team with the signed-in user.
        let my_teams;
        if (ctx.query.scope === 'team') {
            my_teams = await ledTeams(ctx);
            all = all.filter(v => teamsOverlap(my_teams, v.team));
        }
        const counts = {
            pending: everyone.filter(v => v.approval_status === 'pending').length,
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
        return ok({ volunteers, counts, ...(my_teams ? { my_teams } : {}) });
    },

    async volunteer(ctx) {
        const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return r;
        const user = await ctx.db.getUserById(ctx.query.id);
        if (!user) return fail(404, 'Volunteer not found');
        const [{ policies, state }, signatures] = await Promise.all([stateFor(ctx.db, user, ctx.now), ctx.db.listSignatures(user.id)]);
        return ok({ user: withTeams(user), state, policies: policies.map(policySummary), signatures });
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
        if ('role' in body) {
            if (!ROLES.includes(body.role)) errors.push('Invalid role');
            else if (target.id === ctx.user.id && body.role !== target.role) return fail(400, 'You cannot change your own role');
            else fields.role = body.role;
        }
        const d = validatePartialDetails(body);
        errors.push(...d.errors);
        Object.assign(fields, d.fields);
        if (errors.length) return fail(400, errors.join('. '));
        if (Object.keys(fields).length === 0) return fail(400, 'Nothing to update');
        const user = await ctx.db.updateUser(target.id, fields);
        const { state } = await stateFor(ctx.db, user, ctx.now);
        return ok({ user: withTeams(user), state });
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
        const rows = all.map(v => [csvCell(v.volunteer_number), csvCell(v.full_name), csvCell(v.email), csvCell(v.role), csvCell(v.team), csvCell(v.mobile_phone, { phone: true }), csvCell(v.date_of_birth), csvCell(v.next_of_kin_name), csvCell(v.next_of_kin_phone, { phone: true }), csvCell(v.is_active), csvCell(v.state.details_complete), csvCell(v.state.photo_complete), csvCell(v.state.signature_status), csvCell(v.state.signature?.signed_at || ''), csvCell(v.state.signature?.expires_at || '')].join(','));
        const date = ctx.now.toISOString().slice(0, 10);
        return { status: 200, raw: '\uFEFF' + [header.join(','), ...rows].join('\n'), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="volunteers-${date}.csv"` } };
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
            const changes = {};
            if (policy.title !== title) changes.title = title;
            if ('requires_signature' in body) changes.requires_signature = body.requires_signature !== false && body.requires_signature !== 'false';
            if (Object.keys(changes).length) policy = { ...policy, ...(await ctx.db.updatePolicy(policy.id, changes)) };
        } else {
            const slug = slugify(body.slug || title);
            if (!slug) return fail(400, 'Could not make a slug from the title');
            const all = await ctx.db.listAllPolicies();
            if (all.some(p => p.slug === slug)) return fail(409, `A policy with the slug "${slug}" already exists`);
            const sort_order = all.reduce((m, p) => Math.max(m, p.sort_order), 0) + 1;
            policy = await ctx.db.insertPolicy({ slug, title, sort_order, requires_signature: body.requires_signature !== false && body.requires_signature !== 'false' });
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
        const changes = { is_active: Boolean(is_active) };
        if ('requires_signature' in (ctx.body || {})) changes.requires_signature = Boolean(ctx.body.requires_signature);
        const row = await ctx.db.updatePolicy(policy_id, changes);
        return ok({ policy: policyFull({ ...existing, ...row }) });
    }
});

// Actions that need no login.
const PUBLIC_ACTIONS = new Set(['ping', 'signup', 'team-list']);

// --- Managed teams -------------------------------------------------------------------------
// A team is a regular session, e.g. "Bolton Friday", with any number of team leads.
// Volunteers store team names in outreach_users.team; leads live in the team_leads table.
function teamOptions() {
    return TEAM_ROWS.length ? TEAM_ROWS.map(t => ({ name: t.name, town: t.town, day: t.day || null })) : TEAMS.map(n => ({ name: n, town: n, day: null }));
}

// Teams the signed-in person leads. Before teams are managed in the database, fall back to their own teams.
async function ledTeams(ctx) {
    if (TEAM_ROWS.length && ctx.db.listTeamLeads) {
        const leads = await ctx.db.listTeamLeads();
        const ids = new Set(leads.filter(l => l.user_id === ctx.user.id).map(l => l.team_id));
        return TEAM_ROWS.filter(t => ids.has(t.id)).map(t => t.name);
    }
    const me = await ctx.db.getUserById(ctx.user.id);
    return parseTeams(me && me.team) || [];
}

// True when the teams table exists (even if empty). The real db exposes teamsTableExists; the test fake always has it.
async function teamsTableReady(db) { return db.teamsTableExists ? db.teamsTableExists() : true; }

async function teamsWithLeads(db, { includeInactive }) {
    const [rows, leads, users] = await Promise.all([db.listTeams(), db.listTeamLeads(), db.listUsers()]);
    const byId = new Map(users.map(u => [u.id, u]));
    return rows.filter(t => includeInactive || t.is_active).map(t => ({
        id: t.id, name: t.name, town: t.town, day: t.day || null, sort_order: t.sort_order, is_active: t.is_active,
        leads: leads.filter(l => l.team_id === t.id).map(l => byId.get(l.user_id)).filter(Boolean).map(u => ({ id: u.id, full_name: u.full_name, role: u.role })),
        member_count: users.filter(u => u.approval_status !== 'pending' && String(u.team || '').split(',').map(s => s.trim()).includes(t.name)).length
    }));
}

Object.assign(handlers, {
    async 'team-list'(ctx) {
        return ok({ teams: teamOptions() }); // dispatch has loaded the active teams; falls back to towns
    },

    async teams(ctx) {
        const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return r;
        const all = await teamsWithLeads(ctx.db, { includeInactive: ctx.user.role === 'admin' });
        const staff = ctx.user.role === 'admin' ? (await ctx.db.listUsers()).filter(u => ['admin', 'team_lead'].includes(u.role) && u.is_active).map(u => ({ id: u.id, full_name: u.full_name, role: u.role })) : undefined;
        return ok({ teams: all, set_up: TEAM_ROWS.length > 0 || all.length > 0, ...(staff ? { staff } : {}) });
    },

    async 'team-save'(ctx) {
        const m = requirePost(ctx); if (m) return m;
        const r = requireRole(ctx, ['admin']); if (r) return r;
        if (!TEAM_ROWS.length && (await ctx.db.listTeams()).length === 0 && !(await teamsTableReady(ctx.db))) {
            return fail(503, 'Teams are not set up in the database yet. Run the teams migration in Supabase, then try again.');
        }
        const body = ctx.body || {};
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const town = String(body.town || '').trim();
        const day = String(body.day || '').trim() || null;
        if (name.length < 2 || name.length > 60) return fail(400, 'Team name must be 2 to 60 characters');
        if (name.includes(',')) return fail(400, 'Team names cannot contain commas');
        if (!town) return fail(400, 'Town is required');
        const existing = await ctx.db.listTeams();
        if (existing.some(t => t.id !== body.team_id && t.name.toLowerCase() === name.toLowerCase())) return fail(409, `A team called "${name}" already exists`);
        const fields = { name, town, day, ...('is_active' in body ? { is_active: Boolean(body.is_active) } : {}) };
        let team;
        if (body.team_id) {
            const before = existing.find(t => t.id === body.team_id);
            if (!before) return fail(404, 'Team not found');
            team = await ctx.db.updateTeam(before.id, fields);
            if (before.name !== name) {
                // Move every member's stored team name across to the new name.
                for (const u of await ctx.db.listUsers()) {
                    const list = String(u.team || '').split(',').map(s => s.trim()).filter(Boolean);
                    if (list.includes(before.name)) await ctx.db.updateUser(u.id, { team: list.map(n => n === before.name ? name : n).join(', ') });
                }
            }
        } else {
            team = await ctx.db.insertTeam({ ...fields, sort_order: existing.reduce((mx, t) => Math.max(mx, t.sort_order || 0), 0) + 1 });
        }
        if (Array.isArray(body.lead_ids)) {
            const users = await ctx.db.listUsers();
            const valid = new Set(users.filter(u => ['admin', 'team_lead'].includes(u.role)).map(u => u.id));
            const ids = [...new Set(body.lead_ids.map(String))];
            const bad = ids.filter(id => !valid.has(id));
            if (bad.length) return fail(400, 'Team leads must have the Team Lead or Admin role');
            await ctx.db.setTeamLeads(team.id, ids);
        }
        const out = (await teamsWithLeads(ctx.db, { includeInactive: true })).find(t => t.id === team.id);
        return ok({ team: out });
    }
});

function usernameFromEmail(email, isTaken) {
    const base = String(email || '').split('@')[0].toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40) || 'volunteer';
    let candidate = base, n = 1;
    while (isTaken(candidate)) candidate = base + (++n);
    return candidate;
}

function teamsOverlap(a, b) { const x = parseTeams(a) || []; return (parseTeams(b) || []).some(t => x.includes(t)); }

// Self sign-up: creates a pending, inactive volunteer. Nothing about the account is returned.
async function signup(ctx) {
    const m = requirePost(ctx); if (m) return m;
    const body = ctx.body || {};
    if (String(body.website || '').trim()) return ok({ pending: true }); // honeypot: pretend success
    const errors = [];
    const full_name = String(body.full_name || '').trim().replace(/\s+/g, ' ');
    if (full_name.length < 2 || full_name.length > 100) errors.push('Please enter your full name');
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) errors.push('Please enter a valid email address');
    const teams = parseTeams(body.team);
    if (!teams || teams.length === 0) errors.push('Please choose at least one team');
    const AuthUtils = require('./auth');
    const pw = AuthUtils.validatePassword(String(body.password || ''));
    if (!pw.valid) errors.push(...pw.errors);
    if (errors.length) return fail(400, errors.join('. '));
    if (await ctx.db.findUserByEmail(email)) return fail(409, 'That email address is already registered. Try signing in, or ask an admin for a password reset.');
    const taken = new Set((await ctx.db.listUsers()).map(u => String(u.username).toLowerCase()));
    const username = usernameFromEmail(email, u => taken.has(u));
    const hashPassword = ctx.hashPassword || AuthUtils.hashPassword;
    await ctx.db.insertUser({ username, email, full_name, role: 'volunteer', is_active: false, approval_status: 'pending', email_verified: false, password_hash: await hashPassword(String(body.password)), password_set_at: ctx.now.toISOString(), team: teams.join(', ') });
    console.log(`Sign-up pending approval: ${username} (${teams.join(', ')})`);
    return ok({ pending: true });
}

async function pendingFor(ctx) {
    const r = requireRole(ctx, ['admin', 'team_lead']); if (r) return { error: r };
    const mine = ctx.user.role === 'admin' ? null : await ledTeams(ctx);
    const all = (await ctx.db.listUsers()).filter(u => u.approval_status === 'pending');
    const visible = mine ? all.filter(u => teamsOverlap(mine, u.team)) : all;
    return { pending: visible.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(withTeams) };
}

async function pendingTarget(ctx) {
    const m = requirePost(ctx); if (m) return { error: m };
    const { pending, error } = await pendingFor(ctx); if (error) return { error };
    const target = await ctx.db.getUserById(ctx.body && ctx.body.user_id);
    if (!target) return { error: fail(404, 'Sign-up not found') };
    if (target.approval_status !== 'pending') return { error: fail(400, 'That sign-up has already been dealt with') };
    if (!pending.some(p => p.id === target.id)) return { error: fail(403, 'That sign-up is for a team you do not lead') };
    return { target };
}

Object.assign(handlers, {
    signup,
    async 'pending-signups'(ctx) { const { pending, error } = await pendingFor(ctx); return error || ok({ pending }); },
    async 'approve-signup'(ctx) {
        const { target, error } = await pendingTarget(ctx); if (error) return error;
        const user = await ctx.db.updateUser(target.id, { is_active: true, approval_status: 'approved', approved_by: ctx.user.id, approved_at: ctx.now.toISOString() });
        const origin = ctx.origin || 'https://homelessaid.co.uk';
        const send = ctx.sendApproval || require('./send-invitation-email').sendApprovalEmail;
        let emailed = false;
        try { const res = await send({ to: target.email, name: target.full_name, loginUrl: `${origin}/portal`, approvedBy: ctx.user.name }); emailed = Boolean(res && res.success); }
        catch (e) { console.error('Approval email failed:', e); }
        return ok({ user: withTeams(user), emailed });
    },
    async 'reject-signup'(ctx) {
        const { target, error } = await pendingTarget(ctx); if (error) return error;
        await ctx.db.deleteUser(target.id);
        console.log(`Sign-up rejected: ${target.username} by ${ctx.user.username}`);
        return ok({});
    }
});

// Single entry point used by the API function: unknown actions 404, blocked or deleted users are refused
// on every action except ping, then the handler runs.
// Vercel merges rewrite query params into req.query but may leave req.url as the original path,
// so look there first; the dev server and direct calls carry the action in the URL or body.
function resolveAction(req, query, body) {
    const fromReq = req && req.query && typeof req.query === 'object' ? req.query.action : undefined;
    const pathOnly = String((req && req.url) || '').split('?')[0];
    return fromReq || (query && query.action) || (body && body.action) || (/\/ping\/?$/.test(pathOnly) ? 'ping' : undefined);
}

async function dispatch(action, ctx) {
    const handler = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : null;
    if (!handler) return fail(404, `Unknown action: ${action}`);
    // Load the managed team list; with no teams in the database the built-in town list is used.
    if (action !== 'ping' && ctx.db && ctx.db.listTeams) {
        const rows = (await ctx.db.listTeams()).filter(t => t.is_active);
        TEAM_ROWS = rows;
        TEAMS = rows.length ? rows.map(t => t.name) : DEFAULT_TEAMS;
    }
    if (!PUBLIC_ACTIONS.has(action)) {
        const row = await ctx.db.getUserById(ctx.user.id);
        if (!row) return fail(401, "This account no longer exists. Please log in again.");
        if (!row.is_active) return fail(403, "This account is blocked. Please contact an administrator.");
        // Use the stored role and name, so a demotion or rename takes effect without waiting for the token to expire.
        ctx = { ...ctx, user: { ...ctx.user, role: row.role, name: row.full_name, username: row.username, email: row.email } };
    }
    return handler(ctx);
}

// Admin: put an account back into "set your password" state and email a fresh link.
// Used for forgotten passwords; the old invitation flow refuses accounts that already have a password.
async function sendResetLink(ctx) {
    const m = requirePost(ctx); if (m) return m;
    const r = requireRole(ctx, ['admin']); if (r) return r;
    const { user_id } = ctx.body || {};
    if (!user_id) return fail(400, 'user_id is required');
    if (user_id === ctx.user.id) return fail(400, 'Use the Account page to change your own password');
    const target = await ctx.db.getUserById(user_id);
    if (!target) return fail(404, 'User not found');
    const token = require('crypto').randomBytes(32).toString('hex');
    await ctx.db.updateUser(user_id, { password_hash: null, invitation_token: token, invitation_sent_at: ctx.now.toISOString() });
    const origin = ctx.origin || 'https://homelessaid.co.uk';
    const setup_url = `${origin}/portal/setup-password.html?token=${token}`;
    const send = ctx.sendInvitation || require('./send-invitation-email').sendInvitationEmail;
    let emailed = false;
    try {
        const res = await send({ to: target.email, name: target.full_name, username: target.username, role: target.role, invitationUrl: setup_url, invitedBy: ctx.user.name });
        emailed = Boolean(res && res.success);
    } catch (e) { console.error('Reset email failed:', e); }
    return ok({ emailed, setup_url: emailed ? undefined : setup_url });
}
handlers['send-reset-link'] = sendResetLink;

// Admin: set someone's password directly, for volunteers who will not manage a reset link.
// Never used on your own account (use the Account page); every use is logged with the acting admin.
async function setPassword(ctx) {
    const m = requirePost(ctx); if (m) return m;
    const r = requireRole(ctx, ['admin']); if (r) return r;
    const { user_id, password } = ctx.body || {};
    if (!user_id) return fail(400, 'user_id is required');
    if (user_id === ctx.user.id) return fail(400, 'Use the Account page to change your own password');
    const AuthUtils = require('./auth');
    const pw = AuthUtils.validatePassword(String(password || ''));
    if (!pw.valid) return fail(400, pw.errors.join('. '));
    const target = await ctx.db.getUserById(user_id);
    if (!target) return fail(404, 'User not found');
    const hashPassword = ctx.hashPassword || AuthUtils.hashPassword;
    await ctx.db.updateUser(user_id, { password_hash: await hashPassword(String(password)), password_set_at: ctx.now.toISOString(), invitation_token: null });
    console.log(`Password set for ${target.username} (${target.id}) by ${ctx.user.username} (${ctx.user.id})`);
    return ok({});
}
handlers['set-password'] = setPassword;

module.exports = { handlers, dispatch, resolveAction, parseTeams, withTeams, usernameFromEmail, PUBLIC_ACTIONS, TEAMS, ROLES, ok, fail, requirePost, requireRole, policySummary, stateFor, validateDetails, normaliseName, addMonths, sanitizeHtml, validatePhoto };
