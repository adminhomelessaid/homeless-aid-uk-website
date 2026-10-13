(function () {
    const LOGIN = '/portal/login.html';
    const TOKEN_KEYS = ['outreachToken', 'outreach_token'];

    function getToken() { return TOKEN_KEYS.map(k => localStorage.getItem(k)).find(Boolean) || null; }
    function clearAuth() { TOKEN_KEYS.forEach(k => localStorage.removeItem(k)); localStorage.removeItem('outreach_user'); }
    function decode(token) {
        try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
    }
    function requireAuth() {
        const token = getToken();
        const p = token && decode(token);
        if (!p || !p.id || (p.exp && p.exp * 1000 < Date.now())) { clearAuth(); location.href = LOGIN; throw new Error('redirecting'); }
        return { id: p.id, role: p.role, name: p.name, username: p.username, email: p.email };
    }
    function apiUrl(action, query = {}) {
        const u = new URL('/api/registration', location.origin);
        u.searchParams.set('action', action);
        Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v); });
        return u.toString();
    }
    async function api(action, { method = 'GET', body, query } = {}) {
        const res = await fetch(apiUrl(action, query), {
            method, headers: { 'Authorization': `Bearer ${getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        let data = {};
        try { data = await res.json(); } catch { /* non-json */ }
        if (res.status === 401) { clearAuth(); location.href = LOGIN; throw new Error('Session expired'); }
        if (!res.ok || data.success === false) { const e = new Error(data.message || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
        return data;
    }
    async function download(action, query, filename) {
        const res = await fetch(apiUrl(action, query), { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) { let m = 'Download failed'; try { m = (await res.json()).message || m; } catch {} throw new Error(m); }
        const blob = await res.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    function initials(name) { return String(name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }
    function statusChip(state) {
        const s = state?.signature_status;
        if (s === 'signed') return `<span class="st ok">Signed ${escape(fmtDate(state.signature.signed_at))}</span>`;
        if (s === 'expired') return `<span class="st warn">Expired ${escape(fmtDate(state.signature.expires_at))}</span>`;
        if (s === 'outdated') return `<span class="st warn">Needs re-signing</span>`;
        return `<span class="st mute">Not signed</span>`;
    }
    function roleLabel(r) { return { admin: 'Admin', team_lead: 'Team Lead', volunteer: 'Volunteer' }[r] || r; }
    let toastTimer;
    function toast(message, kind = 'ok') {
        let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
        el.className = `toast ${kind === 'error' ? 'error' : ''}`; el.textContent = message;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3500);
    }
    function logout() { clearAuth(); location.href = LOGIN; }
    function renderNav({ active, user }) {
        const items = navItems(user);
        // Phone tab bar: the onboarding essentials for each role. Everything else is under Account.
        const TAB_KEYS = { admin: ['volunteers', 'users', 'policies', 'account'], team_lead: ['my-team', 'registration', 'policies', 'account'] };
        const tabs = (TAB_KEYS[user.role] || ['registration', 'policies', 'account']).map(k => items.find(i => i.key === k)).filter(Boolean);
        const link = (i, cls) => `<a class="${cls}${i.key === active ? ' on' : ''}" href="${i.href}"><i class="fas ${i.icon}"></i><span>${i.label}</span></a>`;
        const host = document.getElementById('shellNav'); if (!host) return;
        host.innerHTML = `
          <nav class="side">
            <div class="brand"><img src="/Branding/HomelessAidUKLogo.png" alt=""> Homeless Aid UK</div>
            ${items.map(i => link(i, '')).join('')}
            <div class="me"><span class="avatar">${escape(initials(user.name))}</span><div>${escape(user.name)}<small>${escape(roleLabel(user.role))}</small></div></div>
            <a class="logout" href="#" data-logout><i class="fas fa-right-from-bracket"></i> Log out</a>
          </nav>
          <nav class="tabbar">${tabs.map(i => link(i, '')).join('')}</nav>`;
        host.querySelector('[data-logout]').addEventListener('click', (e) => { e.preventDefault(); logout(); });
    }
    // Team picker: chips grouped by town. options = [{ name, town, day }], selected = array of names.
    function teamChips(options, selected = []) {
        const towns = [];
        for (const o of options || []) { let g = towns.find(t => t.town === o.town); if (!g) towns.push(g = { town: o.town, items: [] }); g.items.push(o); }
        return towns.map(g => `<div style="margin-bottom:8px">${g.items.some(o => o.day) ? `<div class="small muted" style="font-weight:600;margin:0 0 4px">${escape(g.town)}</div>` : ''}<div class="chips" style="flex-wrap:wrap">${g.items.map(o => { const on = selected.includes(o.name); const label = o.day || o.name; return `<label class="chip ${on ? 'on' : ''}" style="user-select:none"><input type="checkbox" name="team" value="${escape(o.name)}" ${on ? 'checked' : ''} style="display:none">${escape(label)}</label>`; }).join('')}</div></div>`).join('');
    }
    function wireChips(root) { root.querySelectorAll('input[name="team"]').forEach(cb => cb.addEventListener('change', () => cb.parentElement.classList.toggle('on', cb.checked))); }
    function isStaff(user) { return ['admin', 'team_lead'].includes(user && user.role); }
    function navItems(user) {
        return [
            ...(user.role === 'team_lead' ? [{ key: 'my-team', href: '/portal/volunteers?scope=team', icon: 'fa-people-group', label: 'My team' }] : []),
            ...(isStaff(user) ? [
                { key: 'volunteers', href: '/portal/volunteers', icon: 'fa-users', label: user.role === 'team_lead' ? 'All volunteers' : 'Volunteers' },
                { key: 'log', href: '/portal/dashboard.html', icon: 'fa-clipboard-check', label: 'Log attendance' },
                { key: 'attendances', href: '/portal/events-overview.html', icon: 'fa-list-check', label: 'Attendances' }
            ] : []),
            { key: 'registration', href: '/portal/registration', icon: 'fa-user-check', label: 'My registration' },
            { key: 'policies', href: '/portal/registration#policies', icon: 'fa-file-signature', label: 'Policies' },
            ...(user.role === 'admin' ? [{ key: 'users', href: '/portal/admin.html', icon: 'fa-user-gear', label: 'Users' }] : []),
            ...(user.role === 'admin' ? [{ key: 'teams', href: '/portal/teams', icon: 'fa-people-roof', label: 'Teams' }] : []),
            ...(user.role === 'admin' ? [{ key: 'policies-admin', href: '/portal/policies', icon: 'fa-pen-to-square', label: 'Edit policies' }] : []),
            { key: 'account', href: '/portal/account.html', icon: 'fa-circle-user', label: 'Account' }
        ];
    }
    // Where a user goes after login: staff to Volunteers, everyone else to My Registration.
    function landing(user) { return user && user.role === 'team_lead' ? '/portal/volunteers?scope=team' : isStaff(user) ? '/portal/volunteers' : '/portal/registration'; }
    // Generic call for the older endpoints (auth, admin, attendance): same token handling as api().
    async function call(path, { method = 'GET', body } = {}) {
        const res = await fetch(path, {
            method, headers: { 'Authorization': `Bearer ${getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        let data = {};
        try { data = await res.json(); } catch { /* non-json */ }
        if (res.status === 401) { clearAuth(); location.href = LOGIN; throw new Error('Session expired'); }
        if (!res.ok || data.success === false) { const e = new Error(data.message || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
        return data;
    }
    function storeSession(token, user) {
        localStorage.setItem('outreachToken', token);
        localStorage.setItem('outreach_token', token);
        localStorage.setItem('outreach_user', JSON.stringify(user || {}));
    }
    function currentUser() { const t = getToken(); const p = t && decode(t); return p && p.id && (!p.exp || p.exp * 1000 > Date.now()) ? { id: p.id, role: p.role, name: p.name, username: p.username, email: p.email } : null; }
    window.Shell = { teamChips, wireChips, requireAuth, api, apiUrl, download, renderNav, toast, logout, fmtDate, statusChip, escape, initials, roleLabel, getToken, isStaff, navItems, landing, call, storeSession, currentUser, clearAuth };
})();
