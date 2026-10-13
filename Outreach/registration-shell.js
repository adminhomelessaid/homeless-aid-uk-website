(function () {
    const LOGIN = '/Outreach/login.html';
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
        const items = [
            { key: 'registration', href: '/Outreach/registration', icon: 'fa-user-check', label: 'My registration' },
            { key: 'policies', href: '/Outreach/registration#policies', icon: 'fa-file-signature', label: 'Policies' },
            ...(['admin', 'team_lead'].includes(user.role) ? [{ key: 'volunteers', href: '/Outreach/volunteers', icon: 'fa-users', label: 'Volunteers' }] : []),
            ...(user.role === 'admin' ? [{ key: 'policies-admin', href: '/Outreach/policies', icon: 'fa-pen-to-square', label: 'Edit policies' }] : []),
            { key: 'dashboard', href: '/Outreach/dashboard.html', icon: 'fa-clipboard-list', label: 'Attendance' }
        ];
        const link = (i, cls) => `<a class="${cls}${i.key === active ? ' on' : ''}" href="${i.href}"><i class="fas ${i.icon}"></i><span>${i.label}</span></a>`;
        const host = document.getElementById('shellNav'); if (!host) return;
        host.innerHTML = `
          <nav class="side">
            <div class="brand"><img src="/Branding/HomelessAidUKLogo.png" alt=""> Homeless Aid UK</div>
            ${items.map(i => link(i, '')).join('')}
            <div class="me"><span class="avatar">${escape(initials(user.name))}</span><div>${escape(user.name)}<small>${escape(roleLabel(user.role))}</small></div></div>
            <a class="logout" href="#" data-logout><i class="fas fa-right-from-bracket"></i> Log out</a>
          </nav>
          <nav class="tabbar">${items.slice(0, 4).map(i => link(i, '')).join('')}</nav>`;
        host.querySelector('[data-logout]').addEventListener('click', (e) => { e.preventDefault(); logout(); });
    }
    window.Shell = { requireAuth, api, apiUrl, download, renderNav, toast, logout, fmtDate, statusChip, escape, initials, roleLabel, getToken };
})();
