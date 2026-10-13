# Volunteer Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let volunteers complete a registration (details, photo, one signature covering all policies) on their phone, and let Team Leads and Admins see and manage every volunteer from a CRM-style panel inside the existing Outreach portal.

**Architecture:** One new Vercel serverless function (`api/registration/index.js`) that authenticates the JWT and dispatches on an `action` parameter to pure handler functions in `utils/registration-handlers.js`. Handlers talk to Supabase only through a thin data layer (`utils/registration-db.js`) so they can be unit tested with a fake. Three new static pages in `Outreach/` share one stylesheet and one shell script (auth, API helper, navigation), built mobile-first.

**Tech Stack:** Node 20 on Vercel (Hobby), Supabase Postgres (free tier), `@supabase/supabase-js`, `jsonwebtoken`, plain HTML/CSS/JS pages with Inter font, `mammoth` (dev only) for Word to HTML, Node's built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-13-volunteer-registration-design.md`

## Global Constraints

- Vercel Hobby plan: at most 12 serverless functions. Count must be exactly 12 after this work (`find api -name "*.js" | wc -l`).
- Supabase free tier: photos are stored as base64 JPEG in the `outreach_users.photo_data` column, never in Storage.
- Photo limit: 400x400 max, JPEG only, at most 300 KB of decoded bytes, must be square.
- Signature validity: `expires_at = signed_at + 12 months`.
- Typed name must equal the account's `full_name` after trimming, collapsing whitespace, and lowercasing.
- Every action except `ping` requires `Authorization: Bearer <jwt>`; role checks happen server-side in handlers.
- Error shape is always `{ success: false, message }`. Success shape is `{ success: true, ...data }`.
- Admins cannot block, unblock or delete their own account.
- Pages use the brand tokens from `styles.css`: navy `#1A2332`, background `#F9F9F7`, success `#48BB78`, error `#EF5350`, border `#E2E8F0`, font Inter.
- Commit after every task. Do not push to GitHub until Task 17 says to.
- Spec deviation, agreed during planning: `manifest.json` is left alone. A new `Outreach/manifest.json` with `start_url: /Outreach/registration` is added instead, so the public site's "Find Food" shortcut keeps working.

## Review Focus

1. A volunteer whose JWT names one user id sends `?id=<someone else>` to `me`/`update-me`: must be ignored, only their own record is read or written. Test in Task 6.
2. A signature submitted with an out-of-date version list (admin edited a policy between page load and Sign): must be rejected with 409 and the policy names, not recorded. Test in Task 8.
3. A policy retired after a volunteer signed: must not make their signature outdated, since retired policies are excluded from the declaration. Test in Task 3.
4. An upload that is a PNG renamed as JPEG, or a JPEG of 1200x800: must be rejected with a clear 400, and the existing photo left untouched. Test in Task 7.
5. Admin attempts to delete themselves, or deletes with a wrong `confirm_name`: must be refused with 400 and nothing deleted. Test in Task 9.

---

## File map

| Path | Responsibility |
|---|---|
| `database/volunteer-registration.sql` | Migration: new columns, tables, sequence, indexes |
| `utils/send-invitation-email.js` | Moved email helper (was an API function) |
| `utils/registration-state.js` | Pure function: compute registration state from user, signature, policies |
| `utils/sanitize-html.js` | Allowlist HTML sanitiser for policy bodies |
| `utils/jpeg.js` | Validate base64 JPEG: magic bytes, size, square dimensions |
| `utils/registration-db.js` | Thin Supabase data layer, one function per query |
| `utils/registration-handlers.js` | Action handlers, pure given `ctx` and `db` |
| `api/registration/index.js` | Vercel function: CORS, auth, dispatch, response |
| `tests/*.test.js` | `node:test` unit tests |
| `Outreach/registration.css` | Shared styles for the three new pages |
| `Outreach/registration-shell.js` | Auth, API helper, nav rendering, toasts |
| `Outreach/registration.html` | Volunteer page: home, details, photo, policies, account |
| `Outreach/volunteers.html` | Team Lead/Admin list and volunteer record |
| `Outreach/policies-admin.html` | Admin policy editor |
| `Outreach/manifest.json` | Portal PWA manifest |
| `scripts/seed-policies.js` | Word to HTML seeding |
| `vercel.json`, `package.json`, `Outreach/dashboard.html` | Config and banner changes |

---

### Task 1: Database migration

**Files:**
- Create: `database/volunteer-registration.sql`

**Interfaces:**
- Produces: tables `policies`, `policy_versions`, `policy_signatures`; columns on `outreach_users`: `date_of_birth date`, `next_of_kin_name varchar(100)`, `next_of_kin_phone varchar(30)`, `mobile_phone varchar(30)`, `team varchar(60)`, `photo_data text`, `photo_updated_at timestamptz`, `volunteer_number integer unique`.

- [ ] **Step 1: Write the migration**

```sql
-- Volunteer Registration migration. Safe to run once.
-- 1. Columns on outreach_users
ALTER TABLE outreach_users
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS next_of_kin_name varchar(100),
  ADD COLUMN IF NOT EXISTS next_of_kin_phone varchar(30),
  ADD COLUMN IF NOT EXISTS mobile_phone varchar(30),
  ADD COLUMN IF NOT EXISTS team varchar(60),
  ADD COLUMN IF NOT EXISTS photo_data text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS volunteer_number integer;

CREATE SEQUENCE IF NOT EXISTS volunteer_number_seq START 1;

-- Backfill existing users in creation order, then default new ones
UPDATE outreach_users u
SET volunteer_number = s.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM outreach_users
) s
WHERE u.id = s.id AND u.volunteer_number IS NULL;

SELECT setval('volunteer_number_seq', COALESCE((SELECT MAX(volunteer_number) FROM outreach_users), 0) + 1, false);

ALTER TABLE outreach_users
  ALTER COLUMN volunteer_number SET DEFAULT nextval('volunteer_number_seq');

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_users_volunteer_number ON outreach_users(volunteer_number);

-- 2. Policies
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(60) UNIQUE NOT NULL,
  title varchar(150) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body_html text NOT NULL,
  change_note varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES outreach_users(id) ON DELETE SET NULL,
  UNIQUE (policy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, version DESC);

-- 3. Signatures
CREATE TABLE IF NOT EXISTS policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES outreach_users(id) ON DELETE CASCADE,
  typed_name varchar(100) NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  version_ids uuid[] NOT NULL,
  ip_address varchar(45),
  user_agent varchar(300)
);

CREATE INDEX IF NOT EXISTS idx_policy_signatures_user ON policy_signatures(user_id, signed_at DESC);

-- 4. Attendance logs must not block user deletion
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_user_id_fkey;
ALTER TABLE attendance_logs
  ADD CONSTRAINT attendance_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES outreach_users(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Run it**

Open the Supabase dashboard, project `homeless-aid-uk-attendance`, SQL Editor, paste the file, Run. If the Supabase connector is authorised in this session, run it through that instead.

- [ ] **Step 3: Verify**

Run in the SQL editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'outreach_users' AND column_name IN ('date_of_birth','next_of_kin_name','next_of_kin_phone','mobile_phone','team','photo_data','photo_updated_at','volunteer_number');
SELECT count(*) FROM policies; SELECT count(*) FROM policy_versions; SELECT count(*) FROM policy_signatures;
SELECT username, volunteer_number FROM outreach_users ORDER BY volunteer_number;
```

Expected: eight column names, three zero counts, every user has a distinct number.

- [ ] **Step 4: Commit**

```bash
git add database/volunteer-registration.sql
git commit -m "Add Volunteer Registration database migration"
```

---

### Task 2: Free a function slot and set up tests

**Files:**
- Create: `utils/send-invitation-email.js`
- Delete: `api/send-invitation-email.js`
- Modify: `api/admin/create-user.js:189-214`
- Modify: `vercel.json` (functions block)
- Modify: `package.json`
- Create: `tests/smoke.test.js`

**Interfaces:**
- Produces: `sendInvitationEmail({ to, name, username, role, invitationUrl, invitedBy }) -> Promise<{ success: boolean, provider?: string, message?: string }>`

- [ ] **Step 1: Create the helper**

Create `utils/send-invitation-email.js`. Copy the body of `api/send-invitation-email.js` from `const { to, name, ...} = req.body;` through the `textContent` template verbatim into a function, then replace the sending section with:

```js
async function sendInvitationEmail({ to, name, username, role, invitationUrl, invitedBy }) {
    if (!to || !name || !invitationUrl) {
        return { success: false, message: 'Missing required fields' };
    }
    const roleMap = { admin: 'Administrator', team_lead: 'Team Lead', volunteer: 'Volunteer' };
    const displayRole = roleMap[role] || role;
    const subject = 'Welcome to Homeless Aid UK - Set Up Your Account';
    const htmlContent = `...copied verbatim...`;
    const textContent = `...copied verbatim...`.trim();

    try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Homeless Aid UK <noreply@homelessaid.co.uk>',
                to: [to], subject, html: htmlContent, text: textContent
            })
        });
        if (resendResponse.ok) {
            const result = await resendResponse.json();
            console.log(`Invitation email sent via Resend to ${to} (${name})`);
            return { success: true, provider: 'resend', id: result.id };
        }
        console.error('Resend responded', resendResponse.status);
    } catch (resendError) {
        console.error('Resend API error:', resendError);
    }
    return { success: false, message: 'Failed to send invitation email' };
}

module.exports = { sendInvitationEmail };
```

The Office 365 fallback called `/api/send-email-backup`, which does not exist in the repo. Drop it.

- [ ] **Step 2: Call it from create-user**

In `api/admin/create-user.js`, add at the top:

```js
const { sendInvitationEmail } = require('../../utils/send-invitation-email');
```

Replace the `// Send invitation email` try block (the `fetch` to `/api/send-invitation-email`) with:

```js
        try {
            const invitationUrl = `${req.headers.origin || 'https://homelessaid.co.uk'}/Outreach/setup-password.html?token=${invitationToken}`;
            const emailResult = await sendInvitationEmail({
                to: createdUser.email,
                name: createdUser.full_name,
                username: createdUser.username,
                role: createdUser.role,
                invitationUrl,
                invitedBy: decoded.name
            });
            if (!emailResult.success) {
                console.error('Failed to send invitation email:', emailResult.message);
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError);
        }
```

- [ ] **Step 3: Delete the old function and update vercel.json**

```bash
git rm api/send-invitation-email.js
```

In `vercel.json`, remove the `"api/send-invitation-email.js": { "maxDuration": 10 }` entry and add `"api/registration/index.js": { "maxDuration": 10 }` in its place. Keep the JSON valid (watch trailing commas).

- [ ] **Step 4: Add test script and dev dependency**

In `package.json` add:

```json
  "scripts": {
    "test": "node --test tests/"
  },
  "devDependencies": {
    "mammoth": "^1.8.0"
  },
```

Then `npm install`.

- [ ] **Step 5: Smoke test**

Create `tests/smoke.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('invitation email helper exports a function', () => {
    const { sendInvitationEmail } = require('../utils/send-invitation-email');
    assert.equal(typeof sendInvitationEmail, 'function');
});
```

Run: `npm test`
Expected: 1 pass.

Run: `find api -name "*.js" | wc -l`
Expected: `11` now, `12` once Task 5 adds the registration function.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move invitation email to a helper and add test runner"
```

---

### Task 3: Registration state rules

**Files:**
- Create: `utils/registration-state.js`
- Test: `tests/registration-state.test.js`

**Interfaces:**
- Produces: `computeRegistrationState(user, latestSignature, activePolicies, now = new Date()) -> { details_complete, photo_complete, signature_status, outdated_policies, signature, registration_complete }`
  - `user`: `{ date_of_birth, mobile_phone, team, next_of_kin_name, next_of_kin_phone, has_photo }`
  - `latestSignature`: `{ signed_at, expires_at, version_ids: string[] } | null`
  - `activePolicies`: `[{ id, title, current_version: { id } }]`
  - `signature_status`: `'signed' | 'expired' | 'outdated' | 'none'`
  - `outdated_policies`: titles whose current version is not in `version_ids` (empty unless outdated)
  - `signature`: `{ signed_at, expires_at } | null`
- Produces: `normaliseName(s) -> string` (trim, collapse whitespace, lowercase)
- Produces: `addMonths(date, n) -> Date`

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRegistrationState, normaliseName, addMonths } = require('../utils/registration-state');

const now = new Date('2026-10-13T10:00:00Z');
const policies = [
    { id: 'p1', title: 'Safeguarding', current_version: { id: 'v1' } },
    { id: 'p2', title: 'Data Protection', current_version: { id: 'v2' } }
];
const fullUser = { date_of_birth: '1990-01-01', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'A', next_of_kin_phone: '0123', has_photo: true };

test('no signature gives none and incomplete', () => {
    const s = computeRegistrationState(fullUser, null, policies, now);
    assert.equal(s.signature_status, 'none');
    assert.equal(s.registration_complete, false);
    assert.equal(s.signature, null);
});

test('valid signature covering all current versions is signed and complete', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    const s = computeRegistrationState(fullUser, sig, policies, now);
    assert.equal(s.signature_status, 'signed');
    assert.equal(s.registration_complete, true);
    assert.deepEqual(s.signature, { signed_at: sig.signed_at, expires_at: sig.expires_at });
});

test('expired signature is expired even if versions match', () => {
    const sig = { signed_at: '2025-01-01T00:00:00Z', expires_at: '2026-01-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'expired');
});

test('re-versioned policy makes signature outdated and names the policy', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v-old'] };
    const s = computeRegistrationState(fullUser, sig, policies, now);
    assert.equal(s.signature_status, 'outdated');
    assert.deepEqual(s.outdated_policies, ['Data Protection']);
});

test('policy added after signing makes signature outdated', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'outdated');
});

test('retired policy does not affect a signature (only active policies passed in)', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2', 'v-retired'] };
    assert.equal(computeRegistrationState(fullUser, sig, policies, now).signature_status, 'signed');
});

test('missing details or photo makes incomplete even when signed', () => {
    const sig = { signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1', 'v2'] };
    const s = computeRegistrationState({ ...fullUser, next_of_kin_phone: '' }, sig, policies, now);
    assert.equal(s.details_complete, false);
    assert.equal(s.registration_complete, false);
    const s2 = computeRegistrationState({ ...fullUser, has_photo: false }, sig, policies, now);
    assert.equal(s2.photo_complete, false);
});

test('normaliseName trims, collapses spaces, lowercases', () => {
    assert.equal(normaliseName('  Sarah   Mitchell '), 'sarah mitchell');
});

test('addMonths adds 12 months', () => {
    assert.equal(addMonths(new Date('2026-10-13T10:00:00Z'), 12).toISOString(), '2027-10-13T10:00:00.000Z');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `../utils/registration-state`.

- [ ] **Step 3: Implement**

```js
function normaliseName(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function addMonths(date, n) {
    const d = new Date(date.getTime());
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
}

function computeRegistrationState(user, latestSignature, activePolicies, now = new Date()) {
    const details_complete = Boolean(user.date_of_birth && user.mobile_phone && user.team && user.next_of_kin_name && user.next_of_kin_phone);
    const photo_complete = Boolean(user.has_photo);

    let signature_status = 'none';
    let outdated_policies = [];
    let signature = null;

    if (latestSignature) {
        signature = { signed_at: latestSignature.signed_at, expires_at: latestSignature.expires_at };
        const signed = new Set(latestSignature.version_ids || []);
        outdated_policies = activePolicies
            .filter(p => !signed.has(p.current_version.id))
            .map(p => p.title);
        if (new Date(latestSignature.expires_at) <= now) {
            signature_status = 'expired';
        } else if (outdated_policies.length > 0) {
            signature_status = 'outdated';
        } else {
            signature_status = 'signed';
        }
    }

    return {
        details_complete,
        photo_complete,
        signature_status,
        outdated_policies: signature_status === 'outdated' ? outdated_policies : [],
        signature,
        registration_complete: details_complete && photo_complete && signature_status === 'signed'
    };
}

module.exports = { computeRegistrationState, normaliseName, addMonths };
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/registration-state.js tests/registration-state.test.js
git commit -m "Add registration state rules"
```

---

### Task 4: HTML sanitiser

**Files:**
- Create: `utils/sanitize-html.js`
- Test: `tests/sanitize-html.test.js`

**Interfaces:**
- Produces: `sanitizeHtml(html) -> string`. Keeps only: `p br h1 h2 h3 h4 strong em b i u ul ol li a blockquote table thead tbody tr th td`. Keeps only `href` on `a`, and only when it starts with `http://`, `https://` or `mailto:`. Removes `script` and `style` elements with their content. Strips every other tag but keeps its text.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHtml } = require('../utils/sanitize-html');

test('keeps allowed tags and text', () => {
    assert.equal(sanitizeHtml('<h2>Title</h2><p>Hello <strong>bold</strong></p>'), '<h2>Title</h2><p>Hello <strong>bold</strong></p>');
});

test('removes script and style with content', () => {
    assert.equal(sanitizeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>'), '<p>a</p><p>b</p>');
});

test('strips disallowed tags but keeps their text', () => {
    assert.equal(sanitizeHtml('<div class="x"><span onclick="y()">text</span></div>'), 'text');
});

test('strips attributes except safe href on a', () => {
    assert.equal(sanitizeHtml('<a href="https://x.org" onclick="z()">l</a>'), '<a href="https://x.org">l</a>');
    assert.equal(sanitizeHtml('<a href="javascript:alert(1)">l</a>'), '<a>l</a>');
    assert.equal(sanitizeHtml('<p style="color:red">t</p>'), '<p>t</p>');
});

test('handles empty and non-string input', () => {
    assert.equal(sanitizeHtml(''), '');
    assert.equal(sanitizeHtml(null), '');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `../utils/sanitize-html`.

- [ ] **Step 3: Implement**

```js
const ALLOWED = new Set(['p','br','h1','h2','h3','h4','strong','em','b','i','u','ul','ol','li','a','blockquote','table','thead','tbody','tr','th','td']);

function sanitizeHtml(html) {
    if (typeof html !== 'string' || !html) return '';
    let out = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag, attrs) => {
        const tag = rawTag.toLowerCase();
        const closing = match.startsWith('</');
        if (!ALLOWED.has(tag)) return '';
        if (closing) return `</${tag}>`;
        if (tag === 'a') {
            const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
            const href = m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : '';
            if (/^(https?:\/\/|mailto:)/i.test(href)) {
                return `<a href="${href.replace(/"/g, '&quot;')}">`;
            }
            return '<a>';
        }
        if (tag === 'br') return '<br>';
        return `<${tag}>`;
    });
    return out;
}

module.exports = { sanitizeHtml };
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/sanitize-html.js tests/sanitize-html.test.js
git commit -m "Add allowlist HTML sanitiser for policies"
```

---

### Task 5: JPEG validation

**Files:**
- Create: `utils/jpeg.js`
- Test: `tests/jpeg.test.js`

**Interfaces:**
- Produces: `validatePhoto(base64) -> { ok: true, buffer, width, height } | { ok: false, message }`. Accepts a plain base64 string or a `data:image/jpeg;base64,` URL. Rules: decoded size at most 307200 bytes, starts with `FF D8 FF`, has a SOF marker, width equals height, width at most 400.
- Produces: `readJpegSize(buffer) -> { width, height } | null`

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePhoto, readJpegSize } = require('../utils/jpeg');

// Minimal JPEG: SOI, a SOF0 segment declaring the size, EOI. Enough for readJpegSize.
function fakeJpeg(width, height, padTo = 0) {
    const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, (height >> 8) & 0xFF, height & 0xFF, (width >> 8) & 0xFF, width & 0xFF, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    let buf = Buffer.concat([Buffer.from([0xFF, 0xD8]), sof, Buffer.from([0xFF, 0xD9])]);
    if (padTo > buf.length) buf = Buffer.concat([buf, Buffer.alloc(padTo - buf.length)]);
    return buf;
}

test('readJpegSize reads SOF0 dimensions', () => {
    assert.deepEqual(readJpegSize(fakeJpeg(400, 400)), { width: 400, height: 400 });
});

test('accepts a square 400px jpeg as plain base64 and as data url', () => {
    const b64 = fakeJpeg(400, 400).toString('base64');
    assert.equal(validatePhoto(b64).ok, true);
    assert.equal(validatePhoto('data:image/jpeg;base64,' + b64).ok, true);
});

test('rejects non-jpeg bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).toString('base64');
    const r = validatePhoto(png);
    assert.equal(r.ok, false);
    assert.match(r.message, /JPEG/);
});

test('rejects non-square and oversized dimensions', () => {
    assert.equal(validatePhoto(fakeJpeg(1200, 800).toString('base64')).ok, false);
    assert.equal(validatePhoto(fakeJpeg(800, 800).toString('base64')).ok, false);
});

test('rejects more than 300 KB', () => {
    const r = validatePhoto(fakeJpeg(400, 400, 307201).toString('base64'));
    assert.equal(r.ok, false);
    assert.match(r.message, /300 KB/);
});

test('rejects empty or garbage input', () => {
    assert.equal(validatePhoto('').ok, false);
    assert.equal(validatePhoto('not base64!!').ok, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `../utils/jpeg`.

- [ ] **Step 3: Implement**

```js
const MAX_BYTES = 307200;
const MAX_SIDE = 400;

function readJpegSize(buf) {
    if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let i = 2;
    while (i + 9 < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
        if (marker === 0xD9 || marker === 0xDA) return null;
        const len = buf.readUInt16BE(i + 2);
        const isSof = (marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
        if (isSof) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
    }
    return null;
}

function validatePhoto(input) {
    if (typeof input !== 'string' || !input.trim()) return { ok: false, message: 'No photo provided' };
    const b64 = input.replace(/^data:image\/jpeg;base64,/i, '').trim();
    if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false, message: 'Photo must be base64 encoded' };
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_BYTES) return { ok: false, message: 'Photo must be 300 KB or smaller' };
    if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
        return { ok: false, message: 'Photo must be a JPEG image' };
    }
    const size = readJpegSize(buffer);
    if (!size) return { ok: false, message: 'Could not read JPEG dimensions' };
    if (size.width !== size.height) return { ok: false, message: 'Photo must be square' };
    if (size.width > MAX_SIDE) return { ok: false, message: `Photo must be ${MAX_SIDE}x${MAX_SIDE} or smaller` };
    return { ok: true, buffer, width: size.width, height: size.height };
}

module.exports = { validatePhoto, readJpegSize, MAX_BYTES, MAX_SIDE };
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/jpeg.js tests/jpeg.test.js
git commit -m "Add JPEG photo validation"
```

---

### Task 6: Data layer and API function skeleton with `ping`, `me`, `update-me`

**Files:**
- Create: `utils/registration-db.js`
- Create: `utils/registration-handlers.js`
- Create: `api/registration/index.js`
- Create: `tests/helpers/fake-db.js`
- Create: `tests/helpers/fixtures.js`
- Test: `tests/registration-handlers.test.js`

**Interfaces:**
- Produces `createRegistrationDb(supabase)` returning an object with these async methods. The full list is here so every later task uses the same names:
  - `ping() -> true`
  - `getUserById(id, { withPhoto = false } = {}) -> user | null`. User rows exclude `password_hash` and `invitation_token`. `photo_data` present only when `withPhoto`; `has_photo` boolean always present.
  - `updateUser(id, fields) -> user` (same shape, no photo)
  - `listUsers() -> user[]` (no photo bytes, with `has_photo`)
  - `deleteUser(id) -> void`
  - `listActivePolicies() -> policy[]` where policy is `{ id, slug, title, sort_order, is_active, created_at, current_version: { id, version, body_html, change_note, created_at } | null }`, sorted by `sort_order`
  - `listAllPolicies() -> policy[]` same shape, including inactive
  - `getPolicyById(id) -> policy | null`
  - `insertPolicy({ slug, title, sort_order }) -> policy row without current_version`
  - `updatePolicy(id, fields) -> policy row`
  - `insertPolicyVersion({ policy_id, version, body_html, change_note, created_by }) -> version row`
  - `getLatestSignature(userId) -> signature | null`
  - `listSignatures(userId) -> signature[]` newest first
  - `insertSignature({ user_id, typed_name, signed_at, expires_at, version_ids, ip_address, user_agent }) -> signature`
  - `listLatestSignaturesByUser() -> Map<userId, signature>`
- Produces `handlers` in `utils/registration-handlers.js`: an object keyed by action name. Each handler is `async (ctx) => result` where:
  - `ctx = { user: { id, role, name, username, email }, method, query, body, db, ip, userAgent, now }`
  - `result = { status, body }` or `{ status, raw: Buffer|string, headers }` for downloads
- Produces helpers exported from the same file: `ok(body)`, `fail(status, message, extra)`, `requirePost(ctx)`, `requireRole(ctx, roles)`, `policySummary(policy)`, `stateFor(db, user, now)`, `validateDetails(body)`, constants `TEAMS`, `ROLES`.
- `TEAMS = ['Bolton','Manchester','Bury','Liverpool','Wigan','Oldham','Glasgow','Leigh','Other']`

- [ ] **Step 1: Write the fake db for tests**

Create `tests/helpers/fake-db.js`:

```js
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
```

- [ ] **Step 1b: Shared test fixtures**

Create `tests/helpers/fixtures.js`:

```js
const NOW = new Date('2026-10-13T10:00:00Z');
const vol = { id: 'u1', username: 'sarah', email: 's@x.org', full_name: 'Sarah Mitchell', role: 'volunteer', is_active: true, created_at: '2026-01-01T00:00:00Z', volunteer_number: 1 };
const other = { id: 'u2', username: 'james', email: 'j@x.org', full_name: 'James K', role: 'volunteer', is_active: true, created_at: '2026-01-02T00:00:00Z', volunteer_number: 2 };

function ctxFor(user, overrides = {}) {
    return { user: { id: user.id, role: user.role, name: user.full_name, username: user.username, email: user.email }, method: 'GET', query: {}, body: {}, ip: '1.2.3.4', userAgent: 'test', now: NOW, ...overrides };
}

module.exports = { NOW, vol, other, ctxFor };
```

- [ ] **Step 2: Write failing tests for ping, me, update-me**

Create `tests/registration-handlers.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');

const { NOW, vol, other, ctxFor } = require('./helpers/fixtures');

test('ping returns ok', async () => {
    const db = createFakeDb();
    const r = await handlers.ping({ db, now: NOW });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
});

test('me returns own profile, state and policies, ignoring ?id', async () => {
    const db = createFakeDb({ users: [vol, other], policies: [{ id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 1, is_active: true }], versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>x</p>' }] });
    const r = await handlers.me({ ...ctxFor(vol, { query: { id: 'u2' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'u1');
    assert.equal(r.body.user.password_hash, undefined);
    assert.equal(r.body.state.signature_status, 'none');
    assert.equal(r.body.policies.length, 1);
    assert.equal(r.body.policies[0].current_version.id, 'v1');
    assert.equal(r.body.policies[0].current_version.body_html, undefined, 'me does not send bodies');
    assert.deepEqual(r.body.teams, ['Bolton','Manchester','Bury','Liverpool','Wigan','Oldham','Glasgow','Leigh','Other']);
});

test('update-me writes only allowed fields to own record', async () => {
    const db = createFakeDb({ users: [vol, other] });
    const body = { date_of_birth: '1990-05-04', mobile_phone: '07700 900000', team: 'Bolton', next_of_kin_name: 'Tom', next_of_kin_phone: '07700 900001', role: 'admin', id: 'u2' };
    const r = await handlers['update-me']({ ...ctxFor(vol, { method: 'POST', body }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.team, 'Bolton');
    assert.equal(db._users.get('u1').role, 'volunteer');
    assert.equal(db._users.get('u2').team, undefined);
    assert.equal(r.body.state.details_complete, true);
});

test('update-me rejects bad date, unknown team, bad phone', async () => {
    const db = createFakeDb({ users: [vol] });
    const base = { date_of_birth: '1990-05-04', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'Tom', next_of_kin_phone: '07700900001' };
    for (const bad of [{ date_of_birth: '04/05/1990' }, { date_of_birth: '2030-01-01' }, { team: 'Mars' }, { mobile_phone: 'abc' }]) {
        const r = await handlers['update-me']({ ...ctxFor(vol, { method: 'POST', body: { ...base, ...bad } }), db });
        assert.equal(r.status, 400, JSON.stringify(bad));
    }
});

test('update-me rejects GET', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers['update-me']({ ...ctxFor(vol), db });
    assert.equal(r.status, 405);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `../utils/registration-handlers`.

- [ ] **Step 4: Implement the data layer**

Create `utils/registration-db.js`:

```js
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
```

`has_photo` is derived from `photo_updated_at` so lists never pull photo bytes. `upload-photo` and `delete-photo` must always set or clear `photo_updated_at` together with `photo_data`. The fake db derives it from `photo_data` instead; tests that seed a photo must set both.

- [ ] **Step 5: Implement the handlers file with ping, me, update-me**

Create `utils/registration-handlers.js`:

```js
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

module.exports = { handlers, TEAMS, ROLES, ok, fail, requirePost, requireRole, policySummary, stateFor, validateDetails, normaliseName, addMonths, sanitizeHtml, validatePhoto };
```

- [ ] **Step 6: Implement the Vercel function**

Create `api/registration/index.js`:

```js
const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');
const { createRegistrationDb } = require('../../utils/registration-db');
const { handlers } = require('../../utils/registration-handlers');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = Object.fromEntries(url.searchParams.entries());
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const action = query.action || body.action;

    const handler = Object.prototype.hasOwnProperty.call(handlers, action) ? handlers[action] : null;
    if (!handler) return res.status(404).json({ success: false, message: `Unknown action: ${action}` });

    let user = null;
    if (action !== 'ping') {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token provided' });
        try {
            const decoded = AuthUtils.verifyJWT(authHeader.substring(7));
            user = { id: decoded.id, role: decoded.role, name: decoded.name, username: decoded.username, email: decoded.email };
        } catch (error) {
            const expired = error.name === 'TokenExpiredError';
            return res.status(401).json({ success: false, message: expired ? 'Token has expired. Please login again.' : 'Invalid token' });
        }
    }

    try {
        const db = createRegistrationDb(createSupabaseClient());
        const result = await handler({
            user, method: req.method, query, body, db,
            ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
            userAgent: (req.headers['user-agent'] || '').slice(0, 300),
            now: new Date()
        });
        if (result.raw !== undefined) {
            for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
            return res.status(result.status).send(result.raw);
        }
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error(`Registration API error [${action}]:`, error);
        return res.status(500).json({ success: false, message: 'An error occurred while processing the request' });
    }
};
```

- [ ] **Step 7: Run to verify pass**

Run: `npm test`
Expected: all pass.

Run: `find api -name "*.js" | wc -l`
Expected: `12`.

- [ ] **Step 8: Commit**

```bash
git add utils/registration-db.js utils/registration-handlers.js api/registration/index.js tests/
git commit -m "Add registration API with ping, me and update-me"
```

---

### Task 7: Photo actions

**Files:**
- Modify: `utils/registration-handlers.js` (add `upload-photo`, `delete-photo`, `photo`)
- Test: `tests/registration-photo.test.js`

**Interfaces:**
- Consumes: `validatePhoto` from Task 5, `ok/fail/requirePost/requireRole/stateFor` from Task 6.
- Produces actions:
  - `upload-photo` POST `{ photo }` (own record; Admin may pass `user_id` to upload for someone else) -> `{ success, user, state }`
  - `delete-photo` POST `{ user_id? }` -> `{ success, user, state }`
  - `photo` GET `?id=<userId>` (Team Lead/Admin, or own id) -> raw JPEG with `Content-Disposition: attachment`

- [ ] **Step 1: Write failing tests**

Create `tests/registration-photo.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, other, ctxFor } = require('./helpers/fixtures');

function fakeJpeg(width, height) {
    const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, (height >> 8) & 0xFF, height & 0xFF, (width >> 8) & 0xFF, width & 0xFF, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    return Buffer.concat([Buffer.from([0xFF, 0xD8]), sof, Buffer.from([0xFF, 0xD9])]).toString('base64');
}
const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, volunteer_number: 8 };

test('upload-photo stores a valid square jpeg on own record and sets photo_updated_at', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body: { photo: 'data:image/jpeg;base64,' + fakeJpeg(400, 400) } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.has_photo, true);
    assert.equal(r.body.state.photo_complete, true);
    assert.ok(db._users.get('u1').photo_data.length > 10);
    assert.ok(db._users.get('u1').photo_updated_at);
});

test('upload-photo rejects png and non-square and leaves existing photo alone', async () => {
    const db = createFakeDb({ users: [{ ...vol, photo_data: 'OLD', photo_updated_at: '2026-01-01T00:00:00Z' }] });
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]).toString('base64');
    for (const photo of [png, fakeJpeg(1200, 800)]) {
        const r = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body: { photo } }), db });
        assert.equal(r.status, 400);
        assert.equal(db._users.get('u1').photo_data, 'OLD');
    }
});

test('volunteer cannot upload for another user; admin can', async () => {
    const db = createFakeDb({ users: [vol, other, admin] });
    const body = { photo: fakeJpeg(200, 200), user_id: 'u2' };
    const r1 = await handlers['upload-photo']({ ...ctxFor(vol, { method: 'POST', body }), db });
    assert.equal(r1.status, 403);
    const r2 = await handlers['upload-photo']({ ...ctxFor(admin, { method: 'POST', body }), db });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.user.id, 'u2');
});

test('delete-photo clears photo and timestamp', async () => {
    const db = createFakeDb({ users: [{ ...vol, photo_data: 'OLD', photo_updated_at: '2026-01-01T00:00:00Z' }] });
    const r = await handlers['delete-photo']({ ...ctxFor(vol, { method: 'POST' }), db });
    assert.equal(r.status, 200);
    assert.equal(db._users.get('u1').photo_data, null);
    assert.equal(db._users.get('u1').photo_updated_at, null);
    assert.equal(r.body.state.photo_complete, false);
});

test('photo download: team lead gets jpeg bytes with attachment header; volunteer gets own only', async () => {
    const b64 = fakeJpeg(400, 400);
    const db = createFakeDb({ users: [{ ...vol, photo_data: b64, photo_updated_at: '2026-01-01T00:00:00Z' }, other, lead] });
    const r = await handlers.photo({ ...ctxFor(lead, { query: { id: 'u1' } }), db });
    assert.equal(r.status, 200);
    assert.ok(Buffer.isBuffer(r.raw));
    assert.equal(r.headers['Content-Type'], 'image/jpeg');
    assert.match(r.headers['Content-Disposition'], /attachment; filename="HAUK-0001-sarah-mitchell.jpg"/);
    const own = await handlers.photo({ ...ctxFor(vol, { query: { id: 'u1' } }), db });
    assert.equal(own.status, 200);
    const denied = await handlers.photo({ ...ctxFor(other, { query: { id: 'u1' } }), db });
    assert.equal(denied.status, 403);
    const none = await handlers.photo({ ...ctxFor(lead, { query: { id: 'u2' } }), db });
    assert.equal(none.status, 404);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, `handlers['upload-photo'] is not a function`.

- [ ] **Step 3: Implement**

Add to `utils/registration-handlers.js`, before `module.exports`, and merge into the `handlers` object:

```js
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
```

The fake db sets `has_photo` from `photo_data`, so the `has_photo` assertion works there; the real db sets it from `photo_updated_at`, which this handler also writes.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/registration-handlers.js tests/registration-photo.test.js
git commit -m "Add photo upload, delete and download actions"
```

---

### Task 8: Policy reading and signing

**Files:**
- Modify: `utils/registration-handlers.js` (add `policies`, `sign`)
- Test: `tests/registration-sign.test.js`

**Interfaces:**
- Consumes: `computeRegistrationState`, `normaliseName`, `addMonths`, `policySummary`, `stateFor`.
- Produces actions:
  - `policies` GET -> `{ success, policies: [{ ...policySummary, current_version: { ..., body_html } }], state }`
  - `sign` POST `{ typed_name, version_ids }` -> `{ success, signature: { signed_at, expires_at }, state }`. 409 with `{ outdated_policies }` when `version_ids` does not exactly cover the current version of every active policy.

- [ ] **Step 1: Write failing tests**

Create `tests/registration-sign.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, ctxFor } = require('./helpers/fixtures');

const seed = () => ({
    users: [vol],
    policies: [
        { id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 2, is_active: true },
        { id: 'p2', slug: 'expectations', title: 'Volunteer Expectations', sort_order: 1, is_active: true },
        { id: 'p3', slug: 'old', title: 'Retired', sort_order: 3, is_active: false }
    ],
    versions: [
        { id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>old</p>' },
        { id: 'v1b', policy_id: 'p1', version: 2, body_html: '<p>new</p>' },
        { id: 'v2', policy_id: 'p2', version: 1, body_html: '<p>exp</p>' },
        { id: 'v3', policy_id: 'p3', version: 1, body_html: '<p>retired</p>' }
    ]
});

test('policies returns active policies in order with current body', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.policies({ ...ctxFor(vol), db });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.policies.map(p => p.slug), ['expectations', 'safeguarding']);
    assert.equal(r.body.policies[1].current_version.id, 'v1b');
    assert.equal(r.body.policies[1].current_version.body_html, '<p>new</p>');
    assert.equal(r.body.state.signature_status, 'none');
});

test('sign records a signature covering current versions, 12 month expiry, audit fields', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: '  sarah   MITCHELL ', version_ids: ['v2', 'v1b'] } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.state.signature_status, 'signed');
    assert.equal(r.body.signature.expires_at, '2027-10-13T10:00:00.000Z');
    const row = db._signatures[0];
    assert.equal(row.user_id, 'u1');
    assert.equal(row.typed_name, 'sarah   MITCHELL'.trim());
    assert.deepEqual([...row.version_ids].sort(), ['v1b', 'v2']);
    assert.equal(row.ip_address, '1.2.3.4');
    assert.equal(row.user_agent, 'test');
});

test('sign rejects wrong name', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Someone Else', version_ids: ['v2', 'v1b'] } }), db });
    assert.equal(r.status, 400);
    assert.equal(db._signatures.length, 0);
});

test('sign rejects stale version list with 409 and names policies', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2', 'v1'] } }), db });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.outdated_policies, ['Safeguarding']);
    assert.equal(db._signatures.length, 0);
});

test('sign rejects missing policy or extra unknown ids', async () => {
    const db = createFakeDb(seed());
    const missing = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2'] } }), db });
    assert.equal(missing.status, 409);
    const extra = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: ['v2', 'v1b', 'v3'] } }), db });
    assert.equal(extra.status, 409);
});

test('sign with no active policies is refused', async () => {
    const db = createFakeDb({ users: [vol] });
    const r = await handlers.sign({ ...ctxFor(vol, { method: 'POST', body: { typed_name: 'Sarah Mitchell', version_ids: [] } }), db });
    assert.equal(r.status, 400);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, `handlers.policies is not a function`.

- [ ] **Step 3: Implement**

Add to `utils/registration-handlers.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/registration-handlers.js tests/registration-sign.test.js
git commit -m "Add policy reading and signing actions"
```

---

### Task 9: Admin volunteer actions

**Files:**
- Modify: `utils/registration-handlers.js` (add `volunteers`, `volunteer`, `admin-update-volunteer`, `block`, `unblock`, `delete-volunteer`, `export`)
- Test: `tests/registration-admin.test.js`

**Interfaces:**
- Produces actions:
  - `volunteers` GET `?q=&status=&role=` (Team Lead, Admin) -> `{ success, volunteers: [{ ...user, state }], counts: { total, complete, needs_signing, incomplete, blocked } }`. `status` filter values: `needs_signing` (signature_status not `signed`), `incomplete` (not registration_complete), `blocked` (`is_active` false), `complete`.
  - `volunteer` GET `?id=` (Team Lead, Admin) -> `{ success, user, state, policies, signatures }`
  - `admin-update-volunteer` POST `{ user_id, full_name?, email?, role?, date_of_birth?, mobile_phone?, team?, next_of_kin_name?, next_of_kin_phone? }` (Admin) -> `{ success, user, state }`. Partial details allowed: only fields present are validated and written.
  - `block` / `unblock` POST `{ user_id }` (Admin) -> `{ success, user }`
  - `delete-volunteer` POST `{ user_id, confirm_name }` (Admin) -> `{ success }`
  - `export` GET (Admin) -> raw CSV, `Content-Disposition: attachment; filename="volunteers-YYYY-MM-DD.csv"`

- [ ] **Step 1: Write failing tests**

Create `tests/registration-admin.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { NOW, vol, other, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const lead = { id: 'l1', username: 'lead', email: 'l@x.org', full_name: 'Lead Er', role: 'team_lead', is_active: true, volunteer_number: 8 };
const done = { ...vol, date_of_birth: '1990-01-01', mobile_phone: '07700900000', team: 'Bolton', next_of_kin_name: 'T', next_of_kin_phone: '07700900001', photo_data: 'x', photo_updated_at: '2026-01-01T00:00:00Z' };

const seed = () => ({
    users: [done, other, admin, lead, { ...other, id: 'u3', username: 'blocked', email: 'b@x.org', full_name: 'Blocked Person', is_active: false, volunteer_number: 3 }],
    policies: [{ id: 'p1', slug: 's', title: 'Safeguarding', sort_order: 1, is_active: true }],
    versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>x</p>' }],
    signatures: [{ id: 's1', user_id: 'u1', typed_name: 'Sarah Mitchell', signed_at: '2026-10-01T00:00:00Z', expires_at: '2027-10-01T00:00:00Z', version_ids: ['v1'] }]
});

test('volunteers: team lead gets list with state and counts; volunteer is refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.volunteers({ ...ctxFor(lead), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.volunteers.length, 5);
    const sarah = r.body.volunteers.find(v => v.id === 'u1');
    assert.equal(sarah.state.registration_complete, true);
    assert.equal(sarah.photo_data, undefined);
    assert.deepEqual(r.body.counts, { total: 5, complete: 1, needs_signing: 4, incomplete: 4, blocked: 1 });
    const denied = await handlers.volunteers({ ...ctxFor(vol), db });
    assert.equal(denied.status, 403);
});

test('volunteers: filters by q and status', async () => {
    const db = createFakeDb(seed());
    const q = await handlers.volunteers({ ...ctxFor(admin, { query: { q: 'sarah' } }), db });
    assert.deepEqual(q.body.volunteers.map(v => v.id), ['u1']);
    const blocked = await handlers.volunteers({ ...ctxFor(admin, { query: { status: 'blocked' } }), db });
    assert.deepEqual(blocked.body.volunteers.map(v => v.id), ['u3']);
    const complete = await handlers.volunteers({ ...ctxFor(admin, { query: { status: 'complete' } }), db });
    assert.deepEqual(complete.body.volunteers.map(v => v.id), ['u1']);
});

test('volunteer: returns record with signatures; 404 for unknown', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.volunteer({ ...ctxFor(lead, { query: { id: 'u1' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.full_name, 'Sarah Mitchell');
    assert.equal(r.body.signatures.length, 1);
    assert.equal(r.body.state.signature_status, 'signed');
    assert.equal((await handlers.volunteer({ ...ctxFor(lead, { query: { id: 'nope' } }), db })).status, 404);
});

test('admin-update-volunteer: admin edits partial details and role; team lead refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', team: 'Bury', role: 'team_lead', full_name: 'James Kowalski' } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._users.get('u2').team, 'Bury');
    assert.equal(db._users.get('u2').role, 'team_lead');
    assert.equal(db._users.get('u2').full_name, 'James Kowalski');
    const bad = await handlers['admin-update-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', role: 'god' } }), db });
    assert.equal(bad.status, 400);
    const denied = await handlers['admin-update-volunteer']({ ...ctxFor(lead, { method: 'POST', body: { user_id: 'u2', team: 'Bury' } }), db });
    assert.equal(denied.status, 403);
});

test('block and unblock flip is_active; admin cannot block self', async () => {
    const db = createFakeDb(seed());
    const b = await handlers.block({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2' } }), db });
    assert.equal(b.status, 200);
    assert.equal(db._users.get('u2').is_active, false);
    const u = await handlers.unblock({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2' } }), db });
    assert.equal(db._users.get('u2').is_active, true);
    const self = await handlers.block({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1' } }), db });
    assert.equal(self.status, 400);
    assert.equal(db._users.get('a1').is_active, true);
});

test('delete-volunteer requires matching confirm_name and refuses self', async () => {
    const db = createFakeDb(seed());
    const wrong = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', confirm_name: 'Wrong Name' } }), db });
    assert.equal(wrong.status, 400);
    assert.ok(db._users.has('u2'));
    const self = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'a1', confirm_name: 'Ad Min' } }), db });
    assert.equal(self.status, 400);
    assert.ok(db._users.has('a1'));
    const okr = await handlers['delete-volunteer']({ ...ctxFor(admin, { method: 'POST', body: { user_id: 'u2', confirm_name: 'james k' } }), db });
    assert.equal(okr.status, 200);
    assert.ok(!db._users.has('u2'));
});

test('export returns csv without photos; team lead refused', async () => {
    const db = createFakeDb(seed());
    const r = await handlers.export({ ...ctxFor(admin), db });
    assert.equal(r.status, 200);
    assert.match(r.headers['Content-Disposition'], /volunteers-2026-10-13\.csv/);
    const lines = r.raw.split('\n');
    assert.equal(lines[0], 'volunteer_number,full_name,email,role,team,mobile_phone,date_of_birth,next_of_kin_name,next_of_kin_phone,is_active,details_complete,photo_complete,signature_status,signed_at,expires_at');
    assert.ok(lines.some(l => l.includes('Sarah Mitchell') && l.includes('signed')));
    assert.ok(!r.raw.includes('photo_data'));
    assert.equal((await handlers.export({ ...ctxFor(lead), db })).status, 403);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, `handlers.volunteers is not a function`.

- [ ] **Step 3: Implement**

Add to `utils/registration-handlers.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/registration-handlers.js tests/registration-admin.test.js
git commit -m "Add admin volunteer list, record, edit, block, delete and export"
```

---

### Task 10: Policy admin actions and deployment config

**Files:**
- Modify: `utils/registration-handlers.js` (add `policy-save`, `policy-reorder`, `policy-retire`, `policies-admin`)
- Modify: `vercel.json` (rewrites, crons)
- Create: `Outreach/manifest.json`
- Test: `tests/registration-policy-admin.test.js`

**Interfaces:**
- Produces actions (Admin only):
  - `policies-admin` GET -> `{ success, policies: [{ ...policySummary, current_version: { ..., body_html } }] }` including inactive
  - `policy-save` POST `{ policy_id?, slug?, title, body_html, change_note? }` -> `{ success, policy }`. Without `policy_id`: creates policy (slug from title if absent) at the end of the order and version 1. With `policy_id`: inserts the next version; updates title if changed. Body is sanitised; empty body after sanitising is rejected.
  - `policy-reorder` POST `{ order: [policyId, ...] }` -> `{ success }`
  - `policy-retire` POST `{ policy_id, is_active }` -> `{ success, policy }` (also used to un-retire)

- [ ] **Step 1: Write failing tests**

Create `tests/registration-policy-admin.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../utils/registration-handlers');
const { createFakeDb } = require('./helpers/fake-db');
const { vol, ctxFor } = require('./helpers/fixtures');

const admin = { id: 'a1', username: 'admin', email: 'a@x.org', full_name: 'Ad Min', role: 'admin', is_active: true, volunteer_number: 9 };
const seed = () => ({
    users: [admin, vol],
    policies: [{ id: 'p1', slug: 'safeguarding', title: 'Safeguarding', sort_order: 1, is_active: true }],
    versions: [{ id: 'v1', policy_id: 'p1', version: 1, body_html: '<p>one</p>' }]
});

test('policy-save creates a new policy with slug, version 1, sanitised body', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'Volunteer Expectations', body_html: '<h2>Hi</h2><script>x()</script><p onclick="y">text</p>' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.policy.slug, 'volunteer-expectations');
    assert.equal(r.body.policy.sort_order, 2);
    assert.equal(r.body.policy.current_version.version, 1);
    assert.equal(r.body.policy.current_version.body_html, '<h2>Hi</h2><p>text</p>');
    assert.equal(r.body.policy.current_version.created_by, 'a1');
});

test('policy-save on existing policy adds version 2 with change note and new title', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'p1', title: 'Safeguarding Policy', body_html: '<p>two</p>', change_note: 'Updated contacts' } }), db });
    assert.equal(r.status, 200);
    assert.equal(r.body.policy.title, 'Safeguarding Policy');
    assert.equal(r.body.policy.current_version.version, 2);
    assert.equal(r.body.policy.current_version.change_note, 'Updated contacts');
    assert.equal(db._versions.length, 2);
});

test('policy-save rejects empty body, missing title, duplicate slug, non-admin', async () => {
    const db = createFakeDb(seed());
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'X', body_html: '<script>a</script>' } }), db })).status, 400);
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { body_html: '<p>a</p>' } }), db })).status, 400);
    assert.equal((await handlers['policy-save']({ ...ctxFor(admin, { method: 'POST', body: { title: 'Safeguarding', body_html: '<p>a</p>' } }), db })).status, 409);
    assert.equal((await handlers['policy-save']({ ...ctxFor(vol, { method: 'POST', body: { title: 'X', body_html: '<p>a</p>' } }), db })).status, 403);
});

test('policy-reorder sets sort_order in the given order', async () => {
    const db = createFakeDb({ ...seed(), policies: [
        { id: 'p1', slug: 'a', title: 'A', sort_order: 1, is_active: true },
        { id: 'p2', slug: 'b', title: 'B', sort_order: 2, is_active: true }
    ] });
    const r = await handlers['policy-reorder']({ ...ctxFor(admin, { method: 'POST', body: { order: ['p2', 'p1'] } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._policies.get('p2').sort_order, 1);
    assert.equal(db._policies.get('p1').sort_order, 2);
});

test('policy-retire toggles is_active and policies-admin lists inactive too', async () => {
    const db = createFakeDb(seed());
    const r = await handlers['policy-retire']({ ...ctxFor(admin, { method: 'POST', body: { policy_id: 'p1', is_active: false } }), db });
    assert.equal(r.status, 200);
    assert.equal(db._policies.get('p1').is_active, false);
    const list = await handlers['policies-admin']({ ...ctxFor(admin), db });
    assert.equal(list.body.policies.length, 1);
    assert.equal(list.body.policies[0].is_active, false);
    const pub = await handlers.policies({ ...ctxFor(vol), db });
    assert.equal(pub.body.policies.length, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, `handlers['policy-save'] is not a function`.

- [ ] **Step 3: Implement**

Add to `utils/registration-handlers.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Deployment config**

In `vercel.json` add to `rewrites`:

```json
    { "source": "/api/registration/ping", "destination": "/api/registration?action=ping" },
    { "source": "/Outreach/registration", "destination": "/Outreach/registration.html" },
    { "source": "/Outreach/volunteers", "destination": "/Outreach/volunteers.html" },
    { "source": "/Outreach/policies", "destination": "/Outreach/policies-admin.html" }
```

Add a top-level key:

```json
  "crons": [
    { "path": "/api/registration/ping", "schedule": "0 6 * * *" }
  ]
```

Create `Outreach/manifest.json`:

```json
{
  "name": "Homeless Aid UK Volunteers",
  "short_name": "HAUK Volunteers",
  "description": "Volunteer registration and policies for Homeless Aid UK",
  "start_url": "/Outreach/registration",
  "scope": "/Outreach/",
  "display": "standalone",
  "background_color": "#F9F9F7",
  "theme_color": "#1A2332",
  "orientation": "portrait-primary",
  "lang": "en-GB",
  "icons": [
    { "src": "/Branding/HomelessAidUKLogo.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/Branding/HomelessAidUKLogo.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Validate: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); JSON.parse(require('fs').readFileSync('Outreach/manifest.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add utils/registration-handlers.js tests/registration-policy-admin.test.js vercel.json Outreach/manifest.json
git commit -m "Add policy admin actions, cron keep-alive and portal manifest"
```

---

### Task 11: Shared styles, shell script and local dev server

**Files:**
- Create: `Outreach/registration.css`
- Create: `Outreach/registration-shell.js`
- Create: `scripts/dev-server.js`
- Modify: `package.json` (add `dev` script)

**Interfaces:**
- Produces a global `Shell` object in the browser:
  - `Shell.requireAuth() -> { id, role, name, username, email } | redirects to login`
  - `Shell.api(action, { method = 'GET', body, query } = {}) -> Promise<data>`; rejects with `Error(message)` carrying `.status` and `.data`; on 401 clears storage and redirects to login
  - `Shell.apiUrl(action, query) -> string` for download links (adds token via fetch, see `Shell.download`)
  - `Shell.download(action, query, filename)` fetches with the token and triggers a save
  - `Shell.renderNav({ active, user })` renders the sidebar (desktop) and bottom tab bar (phone) into `#shellNav`
  - `Shell.toast(message, kind = 'ok' | 'error')`
  - `Shell.logout()`
  - `Shell.fmtDate(iso) -> '13 Oct 2026'`
  - `Shell.statusChip(state) -> html` for `signature_status`
  - `Shell.escape(s) -> html-safe string`
- Produces CSS classes used by all three pages: `.app`, `.side`, `.main`, `.topbar`, `.tabbar`, `.card`, `.btn`, `.btn.ghost`, `.btn.danger`, `.field`, `.input`, `.select`, `.chip`, `.chip.on`, `.st.ok|.warn|.bad|.mute`, `.kpis`, `.kpi`, `.table`, `.row-card`, `.steps`, `.step`, `.prog`, `.banner`, `.modal`, `.toast`, `.avatar`, `.empty`.
- Produces `npm run dev` serving the site on http://localhost:3000 with `/api/*` routed to the function modules.

- [ ] **Step 1: Stylesheet**

Create `Outreach/registration.css`:

```css
:root {
  --navy: #1A2332; --bg: #F3F4F2; --card: #FFFFFF; --text: #1A2332; --muted: #718096;
  --border: #E2E8F0; --ok: #2F855A; --ok-bg: #F0FFF4; --warn: #C05621; --warn-bg: #FFFAF0;
  --bad: #C53030; --bad-bg: #FFF5F5; --mute-bg: #EDF2F7; --accent: #EF5350; --radius: 14px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
h1 { font-size: 22px; margin: 0; } h2 { font-size: 18px; margin: 0 0 8px; } h3 { font-size: 15px; margin: 0 0 6px; }
.muted { color: var(--muted); } .small { font-size: 13px; }

/* Layout: phone first */
.app { min-height: 100vh; display: flex; flex-direction: column; }
.side { display: none; }
.topbar { background: var(--card); border-bottom: 1px solid var(--border); padding: 14px 16px; position: sticky; top: 0; z-index: 5; }
.topbar p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.main { flex: 1; padding: 14px 16px 90px; max-width: 1100px; width: 100%; margin: 0 auto; }
.tabbar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--border); display: flex; padding: 6px 4px calc(10px + env(safe-area-inset-bottom)); z-index: 5; }
.tabbar a { flex: 1; text-align: center; font-size: 11px; color: var(--muted); text-decoration: none; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 0; }
.tabbar a i { font-size: 18px; } .tabbar a.on { color: var(--navy); font-weight: 700; }

@media (min-width: 900px) {
  .app { flex-direction: row; }
  .side { display: flex; flex-direction: column; gap: 4px; width: 230px; background: var(--navy); color: #cbd5e0; padding: 20px 14px; position: sticky; top: 0; height: 100vh; flex-shrink: 0; }
  .side .brand { color: #fff; font-weight: 700; display: flex; align-items: center; gap: 10px; margin-bottom: 18px; font-size: 15px; }
  .side .brand img { width: 32px; height: 32px; border-radius: 8px; background: #fff; }
  .side a { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; color: #cbd5e0; text-decoration: none; font-size: 14px; }
  .side a i { width: 18px; text-align: center; }
  .side a.on { background: rgba(255,255,255,.12); color: #fff; font-weight: 600; }
  .side .me { margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.12); display: flex; align-items: center; gap: 10px; font-size: 13px; color: #fff; }
  .side .me .avatar { width: 32px; height: 32px; }
  .side .me small { display: block; color: #a0aec0; }
  .side .logout { color: #a0aec0; font-size: 13px; padding: 6px 12px; }
  .topbar { background: transparent; border: 0; position: static; padding: 24px 28px 0; }
  .main { padding: 16px 28px 40px; }
  .tabbar { display: none; }
}

/* Components */
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--navy); color: #fff; border: 0; border-radius: 12px; padding: 12px 16px; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; min-height: 44px; }
.btn.block { width: 100%; } .btn.ghost { background: var(--card); color: var(--navy); border: 1px solid var(--border); }
.btn.danger { background: var(--bad); } .btn.sm { min-height: 36px; padding: 6px 12px; font-size: 13px; border-radius: 10px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.field { display: block; margin-bottom: 14px; } .field > span { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.input, .select, textarea.input { width: 100%; border: 1.5px solid #CBD5E0; border-radius: 12px; padding: 12px; font: inherit; background: #fff; min-height: 46px; }
.input:focus, .select:focus { outline: 2px solid var(--navy); outline-offset: 1px; border-color: var(--navy); }
.chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.chip { flex-shrink: 0; background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: #4A5568; }
.chip.on { background: var(--navy); color: #fff; border-color: var(--navy); }
.st { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.st::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.st.ok { background: var(--ok-bg); color: var(--ok); } .st.warn { background: var(--warn-bg); color: var(--warn); }
.st.bad { background: var(--bad-bg); color: var(--bad); } .st.mute { background: var(--mute-bg); color: #4A5568; }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
@media (min-width: 900px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
.kpi { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; cursor: pointer; }
.kpi .l { color: var(--muted); font-size: 12px; } .kpi .v { font-size: 24px; font-weight: 700; }
.kpi .v.ok { color: var(--ok); } .kpi .v.warn { color: var(--warn); } .kpi .v.bad { color: var(--bad); }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: #CBD5E0; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: var(--navy); flex-shrink: 0; object-fit: cover; overflow: hidden; }
.avatar.lg { width: 96px; height: 96px; font-size: 28px; }
.row-card { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 8px; cursor: pointer; text-decoration: none; color: inherit; }
.row-card b { display: block; } .row-card small { color: var(--muted); } .row-card .r { margin-left: auto; text-align: right; }
.table { display: none; }
@media (min-width: 900px) {
  .row-card { display: none; }
  .table { display: table; width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); padding: 10px 14px; background: #FAFAF9; border-bottom: 1px solid var(--border); }
  .table td { padding: 10px 14px; border-bottom: 1px solid #EDF2F7; vertical-align: middle; }
  .table tr:last-child td { border-bottom: 0; } .table tbody tr { cursor: pointer; } .table tbody tr:hover td { background: #FAFAF9; }
}
.person { display: flex; align-items: center; gap: 10px; } .person b { display: block; } .person small { color: var(--muted); }
.steps { display: grid; gap: 8px; }
.step { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; text-decoration: none; color: inherit; }
.step .ic { width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.step .ic.done { background: var(--ok-bg); color: var(--ok); } .step .ic.todo { background: var(--warn-bg); color: var(--warn); }
.step b { display: block; } .step small { color: var(--muted); } .step .chev { margin-left: auto; color: #A0AEC0; }
.prog { height: 8px; background: var(--mute-bg); border-radius: 4px; overflow: hidden; margin: 8px 0 4px; } .prog i { display: block; height: 100%; background: #48BB78; transition: width .3s; }
.banner { background: var(--warn-bg); border: 1px solid #F6AD55; color: var(--warn); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
.policy-body { font-size: 15px; } .policy-body h1, .policy-body h2, .policy-body h3 { margin: 18px 0 8px; } .policy-body p, .policy-body li { margin: 0 0 10px; }
.policy-body table { border-collapse: collapse; width: 100%; } .policy-body td, .policy-body th { border: 1px solid var(--border); padding: 6px 8px; }
.modal-bg { position: fixed; inset: 0; background: rgba(26,35,50,.55); display: none; align-items: flex-end; justify-content: center; z-index: 20; }
.modal-bg.open { display: flex; }
.modal { background: var(--card); border-radius: 18px 18px 0 0; padding: 20px 16px calc(20px + env(safe-area-inset-bottom)); width: 100%; max-height: 92vh; overflow: auto; }
@media (min-width: 900px) { .modal-bg { align-items: center; } .modal { border-radius: 18px; max-width: 560px; } }
.toast { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); background: var(--navy); color: #fff; padding: 12px 16px; border-radius: 12px; font-size: 14px; z-index: 30; box-shadow: 0 8px 24px rgba(0,0,0,.2); max-width: 90vw; }
.toast.error { background: var(--bad); }
@media (min-width: 900px) { .toast { bottom: 24px; } }
.empty { text-align: center; color: var(--muted); padding: 32px 16px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.hidden { display: none !important; }
```

- [ ] **Step 2: Shell script**

Create `Outreach/registration-shell.js`:

```js
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
```

- [ ] **Step 3: Local dev server**

Create `scripts/dev-server.js`:

```js
// Serves the static site and routes /api/* to the Vercel function modules, so the
// portal can be tested locally. Reads .env for SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}
const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || [];
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv', '.ico': 'image/x-icon' };

function shim(res) {
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = (b) => { res.end(b); };
    return res;
}

http.createServer(async (req, res) => {
    let url = new URL(req.url, 'http://localhost');
    for (const r of rewrites) {
        if (url.pathname === r.source) { const d = new URL(r.destination, 'http://localhost'); d.searchParams.forEach((v, k) => url.searchParams.set(k, v)); url.pathname = d.pathname; break; }
    }
    if (url.pathname.startsWith('/api/')) {
        const rel = url.pathname.replace(/^\/api\//, '');
        const candidates = [path.join(ROOT, 'api', rel + '.js'), path.join(ROOT, 'api', rel, 'index.js')];
        const file = candidates.find(f => fs.existsSync(f));
        if (!file) { res.statusCode = 404; return res.end('No such function'); }
        let raw = ''; for await (const chunk of req) raw += chunk;
        req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
        req.query = Object.fromEntries(url.searchParams.entries());
        req.url = url.pathname + url.search;
        delete require.cache[file];
        try { await require(file)(req, shim(res)); } catch (e) { console.error(e); res.statusCode = 500; res.end('Function error'); }
        return;
    }
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) filePath += '.html';
    if (!fs.existsSync(filePath)) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
}).listen(3000, () => console.log('Dev server on http://localhost:3000'));
```

Add to `package.json` scripts: `"dev": "node scripts/dev-server.js"`.

- [ ] **Step 4: Create `.env` locally**

Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `JWT_SECRET` from the Vercel project (Settings, Environment Variables) or the Supabase dashboard (Settings, API) into `.env` in the repo root. `.env` is already in `.gitignore`; confirm with `git check-ignore .env`.

- [ ] **Step 5: Verify**

Run: `npm run dev`, then in another shell:

```bash
curl -s "http://localhost:3000/api/registration/ping"
curl -s "http://localhost:3000/api/registration?action=me"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/Outreach/registration.css
```

Expected: `{"success":true,"ok":true}`, `{"success":false,"message":"No token provided"}`, `200`.

- [ ] **Step 6: Commit**

```bash
git add Outreach/registration.css Outreach/registration-shell.js scripts/dev-server.js package.json
git commit -m "Add shared portal styles, shell script and local dev server"
```

---

### Task 12: Volunteer registration page

**Files:**
- Create: `Outreach/registration.html`

**Interfaces:**
- Consumes: `Shell` (Task 11); actions `me`, `update-me`, `upload-photo`, `delete-photo`, `policies`, `sign` (Tasks 6 to 8).
- Hash routes: `#home` (default), `#details`, `#photo`, `#policies`, `#policy/<id>`.

- [ ] **Step 1: Write the page**

Create `Outreach/registration.html`:

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>My Registration - Homeless Aid UK</title>
<link rel="manifest" href="/Outreach/manifest.json">
<meta name="theme-color" content="#1A2332">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/Outreach/registration.css">
</head>
<body>
<div class="app">
  <div id="shellNav"></div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    <header class="topbar"><h1 id="title">My registration</h1><p id="subtitle"></p></header>
    <main class="main" id="view"><div class="empty">Loading…</div></main>
  </div>
</div>
<div class="modal-bg" id="modal"><div class="modal" id="modalBody"></div></div>

<script src="/Outreach/registration-shell.js"></script>
<script>
const me = Shell.requireAuth();
Shell.renderNav({ active: location.hash.startsWith('#polic') ? 'policies' : 'registration', user: me });
let data = null;        // { user, state, policies, teams }
let policyBodies = null; // from action=policies

const $ = (s) => document.querySelector(s);
const view = $('#view');
const setHead = (t, s = '') => { $('#title').textContent = t; $('#subtitle').textContent = s; };

async function load() { data = await Shell.api('me'); route(); }

function route() {
    const h = location.hash || '#home';
    Shell.renderNav({ active: h.startsWith('#polic') ? 'policies' : 'registration', user: me });
    if (h.startsWith('#policy/')) return renderPolicy(h.slice(8));
    ({ '#details': renderDetails, '#photo': renderPhoto, '#policies': renderPolicies }[h] || renderHome)();
    window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function progress() {
    const s = data.state; const n = [s.details_complete, s.photo_complete, s.signature_status === 'signed'].filter(Boolean).length;
    return { n, pct: Math.round(n / 3 * 100) };
}

function renderHome() {
    const { user, state } = data; const p = progress();
    const first = (user.full_name || '').split(' ')[0];
    setHead(`Hi ${first} 👋`, state.registration_complete ? 'You are fully registered' : "Let's get you registered");
    const sigReason = state.signature_status === 'expired' ? 'Your signature has expired' : state.signature_status === 'outdated' ? `Updated: ${state.outdated_policies.join(', ')}` : state.signature_status === 'signed' ? `Signed, valid until ${Shell.fmtDate(state.signature.expires_at)}` : `${data.policies.length} policies to read and sign`;
    const next = !state.details_complete ? '#details' : !state.photo_complete ? '#photo' : state.signature_status !== 'signed' ? '#policies' : null;
    view.innerHTML = `
      <div class="card">
        <div class="person"><span class="avatar lg" id="homeAvatar">${Shell.escape(Shell.initials(user.full_name))}</span>
          <div><b style="font-size:17px">${Shell.escape(user.full_name)}</b><br><span class="muted small">${Shell.escape(Shell.roleLabel(user.role))} · Volunteer #${String(user.volunteer_number || 0).padStart(4, '0')}${user.team ? ' · ' + Shell.escape(user.team) : ''}</span></div></div>
        <div class="prog"><i style="width:${p.pct}%"></i></div><span class="muted small">${p.n} of 3 steps complete</span>
      </div>
      <div class="steps">
        <a class="step" href="#details"><span class="ic ${state.details_complete ? 'done' : 'todo'}">${state.details_complete ? '✓' : '!'}</span><div><b>Your details</b><small>Date of birth, mobile, team, next of kin</small></div><i class="fas fa-chevron-right chev"></i></a>
        <a class="step" href="#photo"><span class="ic ${state.photo_complete ? 'done' : 'todo'}">${state.photo_complete ? '✓' : '!'}</span><div><b>Profile photo</b><small>Used for your volunteer ID card</small></div><i class="fas fa-chevron-right chev"></i></a>
        <a class="step" href="#policies"><span class="ic ${state.signature_status === 'signed' ? 'done' : 'todo'}">${state.signature_status === 'signed' ? '✓' : '!'}</span><div><b>Read &amp; sign policies</b><small>${Shell.escape(sigReason)}</small></div><i class="fas fa-chevron-right chev"></i></a>
      </div>
      ${next ? `<a class="btn block" style="margin-top:16px" href="${next}">Continue</a>` : '<div class="card" style="margin-top:16px;text-align:center"><b>All done. Thank you!</b><br><span class="muted small">We will let you know when anything needs re-signing.</span></div>'}
      <p class="small muted" style="margin-top:20px;text-align:center"><a href="/Outreach/account.html">Account settings</a> · <a href="#" onclick="Shell.logout();return false">Log out</a></p>`;
    if (user.has_photo) loadAvatar('#homeAvatar');
}

async function loadAvatar(sel) {
    try {
        const res = await fetch(Shell.apiUrl('photo', { id: me.id }), { headers: { Authorization: `Bearer ${Shell.getToken()}` } });
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const el = $(sel); el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover">`;
    } catch {}
}

function renderDetails() {
    const u = data.user;
    setHead('Your details', 'Kept private, used only in an emergency');
    view.innerHTML = `
      <form class="card" id="detailsForm">
        <label class="field"><span>Full name</span><input class="input" value="${Shell.escape(u.full_name)}" disabled><span class="muted small" style="font-weight:400">Ask an admin to change your name.</span></label>
        <label class="field"><span>Date of birth</span><input class="input" type="date" name="date_of_birth" required max="${new Date().toISOString().slice(0, 10)}" value="${Shell.escape(u.date_of_birth || '')}"></label>
        <label class="field"><span>Mobile number</span><input class="input" type="tel" name="mobile_phone" required autocomplete="tel" inputmode="tel" value="${Shell.escape(u.mobile_phone || '')}"></label>
        <label class="field"><span>Team</span><select class="select" name="team" required><option value="">Choose your team…</option>${data.teams.map(t => `<option ${u.team === t ? 'selected' : ''}>${Shell.escape(t)}</option>`).join('')}</select></label>
        <h3 style="margin-top:8px">Next of kin</h3>
        <label class="field"><span>Name</span><input class="input" name="next_of_kin_name" required value="${Shell.escape(u.next_of_kin_name || '')}"></label>
        <label class="field"><span>Phone</span><input class="input" type="tel" name="next_of_kin_phone" required inputmode="tel" value="${Shell.escape(u.next_of_kin_phone || '')}"></label>
        <button class="btn block" type="submit">Save details</button>
        <a class="btn ghost block" href="#home" style="margin-top:8px">Back</a>
      </form>`;
    $('#detailsForm').addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
            const body = Object.fromEntries(new FormData(e.target).entries());
            const r = await Shell.api('update-me', { method: 'POST', body });
            data.user = r.user; data.state = r.state; Shell.toast('Details saved'); location.hash = '#home';
        } catch (err) { Shell.toast(err.message, 'error'); } finally { btn.disabled = false; }
    });
}

function renderPhoto() {
    setHead('Profile photo', 'A clear photo of your face, like a passport photo');
    view.innerHTML = `
      <div class="card" style="text-align:center">
        <span class="avatar lg" id="photoPreview" style="width:160px;height:160px;font-size:40px;margin:0 auto 12px">${Shell.escape(Shell.initials(data.user.full_name))}</span>
        <input type="file" id="photoInput" accept="image/*" capture="user" class="hidden">
        <div class="actions" style="justify-content:center">
          <button class="btn" id="pickBtn"><i class="fas fa-camera"></i> ${data.user.has_photo ? 'Replace photo' : 'Take or choose photo'}</button>
          ${data.user.has_photo ? '<button class="btn ghost" id="removeBtn">Remove</button>' : ''}
        </div>
        <p class="muted small" style="margin-top:12px">We crop it to a square and shrink it, so any photo works. Admins use it to make your ID card.</p>
        <button class="btn block hidden" id="saveBtn" style="margin-top:8px">Save photo</button>
        <a class="btn ghost block" href="#home" style="margin-top:8px">Back</a>
      </div>`;
    if (data.user.has_photo) loadAvatar('#photoPreview');
    let pending = null;
    $('#pickBtn').onclick = () => $('#photoInput').click();
    $('#photoInput').onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { pending = await squareJpeg(file, 400); $('#photoPreview').innerHTML = `<img src="data:image/jpeg;base64,${pending}" style="width:100%;height:100%;object-fit:cover">`; $('#saveBtn').classList.remove('hidden'); }
        catch (err) { Shell.toast('Could not read that image', 'error'); }
    };
    $('#saveBtn').onclick = async () => {
        const btn = $('#saveBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
        try { const r = await Shell.api('upload-photo', { method: 'POST', body: { photo: pending } }); data.user = r.user; data.state = r.state; Shell.toast('Photo saved'); location.hash = '#home'; }
        catch (err) { Shell.toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save photo'; }
    };
    const rm = $('#removeBtn'); if (rm) rm.onclick = async () => {
        try { const r = await Shell.api('delete-photo', { method: 'POST' }); data.user = r.user; data.state = r.state; renderPhoto(); } catch (err) { Shell.toast(err.message, 'error'); }
    };
}

// Centre-crop to a square, resize, return base64 JPEG (no data: prefix). Quality steps down until under 280 KB.
function squareJpeg(file, size) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
            const c = document.createElement('canvas'); c.width = size; c.height = size;
            c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
            let q = 0.85, b64;
            do { b64 = c.toDataURL('image/jpeg', q).split(',')[1]; q -= 0.1; } while (b64.length * 0.75 > 280000 && q > 0.3);
            URL.revokeObjectURL(img.src); resolve(b64);
        };
        img.onerror = () => reject(new Error('bad image'));
        img.src = URL.createObjectURL(file);
    });
}

async function renderPolicies() {
    setHead('Policies', 'Read each one, then sign once at the bottom');
    view.innerHTML = '<div class="empty">Loading policies…</div>';
    try { const r = await Shell.api('policies'); policyBodies = r.policies; data.state = r.state; } catch (err) { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; return; }
    const s = data.state;
    const banner = s.signature_status === 'signed' ? `<div class="card" style="background:var(--ok-bg);border-color:#9AE6B4"><b>Signed on ${Shell.fmtDate(s.signature.signed_at)}</b><br><span class="small">Valid until ${Shell.fmtDate(s.signature.expires_at)}. You can still read the policies any time.</span></div>`
        : s.signature_status === 'expired' ? `<div class="banner"><i class="fas fa-clock"></i><div><b>Your signature expired on ${Shell.fmtDate(s.signature.expires_at)}.</b> Please read and sign again.</div></div>`
        : s.signature_status === 'outdated' ? `<div class="banner"><i class="fas fa-rotate"></i><div><b>Updated since you signed:</b> ${Shell.escape(s.outdated_policies.join(', '))}. Please read and sign again.</div></div>` : '';
    view.innerHTML = `${banner}
      <div id="policyList">${policyBodies.map(p => `<a class="step" href="#policy/${p.id}"><span class="ic" style="background:var(--mute-bg)"><i class="fas fa-file-lines"></i></span><div><b>${Shell.escape(p.title)}</b><small>Updated ${Shell.fmtDate(p.current_version.created_at)} · ${readMins(p.current_version.body_html)} min read${p.current_version.change_note ? ' · ' + Shell.escape(p.current_version.change_note) : ''}</small></div><i class="fas fa-chevron-right chev"></i></a>`).join('') || '<div class="empty">No policies have been published yet.</div>'}</div>
      ${policyBodies.length && s.signature_status !== 'signed' ? `
      <form class="card" id="signForm" style="margin-top:16px">
        <h3>Declaration</h3>
        <p class="small">I confirm that I have read and understood the ${policyBodies.length} policies listed above, and I agree to follow them while volunteering with Homeless Aid UK.</p>
        <label class="field"><span>Type your full name to sign</span><input class="input" name="typed_name" placeholder="${Shell.escape(data.user.full_name)}" autocomplete="name" required></label>
        <label class="small" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px"><input type="checkbox" name="ack" required style="width:20px;height:20px;margin:0"> I understand this signature is valid for 12 months, or until a policy changes, and that it is recorded with the date and time.</label>
        <button class="btn block" type="submit"><i class="fas fa-pen-nib"></i> Sign policies</button>
      </form>` : ''}
      <a class="btn ghost block" href="#home" style="margin-top:8px">Back</a>`;
    const form = $('#signForm'); if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault(); const btn = form.querySelector('button'); btn.disabled = true;
        try {
            const r = await Shell.api('sign', { method: 'POST', body: { typed_name: form.typed_name.value, version_ids: policyBodies.map(p => p.current_version.id) } });
            data.state = r.state; Shell.toast('Thank you, policies signed'); renderPolicies();
        } catch (err) { Shell.toast(err.message, 'error'); if (err.status === 409) renderPolicies(); btn.disabled = false; }
    });
}

function readMins(html) { return Math.max(1, Math.round(String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).length / 200)); }

async function renderPolicy(id) {
    if (!policyBodies) { try { const r = await Shell.api('policies'); policyBodies = r.policies; data.state = r.state; } catch (err) { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; return; } }
    const p = policyBodies.find(x => x.id === id);
    if (!p) { location.hash = '#policies'; return; }
    setHead(p.title, `Version ${p.current_version.version} · ${Shell.fmtDate(p.current_version.created_at)}`);
    view.innerHTML = `<div class="card policy-body">${p.current_version.body_html}</div><a class="btn block" href="#policies"><i class="fas fa-arrow-left"></i> Back to policies</a>`;
}

load().catch(err => { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; });
</script>
</body>
</html>
```

`body_html` is inserted as HTML on purpose. It is sanitised server-side on every save and by the seed script (Task 4), and only Admins can write it.

- [ ] **Step 2: Verify on desktop and phone width**

Run `npm run dev`, log in at http://localhost:3000/Outreach/login.html as a volunteer test account, open http://localhost:3000/Outreach/registration.

Check, with the browser at full width and again at 390 px wide (device toolbar):
1. Home shows name, number, three steps, correct ticks, Continue goes to the first incomplete step.
2. Details: a future date of birth is refused by the API with a readable message; a valid save returns to Home with a tick.
3. Photo: choosing a landscape photo previews as a square; Save returns to Home with a tick; Home shows the photo.
4. Policies: list opens each policy full screen with a Back button; signing with a wrong name shows the server message; signing with the right name shows the green card and Home shows all three ticks.
5. Sidebar shows on desktop, bottom tabs on phone, Log out works.

- [ ] **Step 3: Commit**

```bash
git add Outreach/registration.html
git commit -m "Add volunteer registration page"
```

---

### Task 13: Volunteers list and record page

**Files:**
- Create: `Outreach/volunteers.html`

**Interfaces:**
- Consumes: `Shell`; actions `volunteers`, `volunteer`, `photo`, `admin-update-volunteer`, `upload-photo`, `delete-photo`, `block`, `unblock`, `delete-volunteer`, `export` (Tasks 7, 9).
- Hash routes: `#list` (default), `#volunteer/<id>`.

- [ ] **Step 1: Write the page**

Create `Outreach/volunteers.html`:

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Volunteers - Homeless Aid UK</title>
<link rel="manifest" href="/Outreach/manifest.json">
<meta name="theme-color" content="#1A2332">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/Outreach/registration.css">
</head>
<body>
<div class="app">
  <div id="shellNav"></div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    <header class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><h1 id="title">Volunteers</h1><p id="subtitle"></p></div>
      <div class="actions" id="headActions"></div>
    </header>
    <main class="main" id="view"><div class="empty">Loading…</div></main>
  </div>
</div>
<div class="modal-bg" id="modal"><div class="modal" id="modalBody"></div></div>

<script src="/Outreach/registration-shell.js"></script>
<script>
const me = Shell.requireAuth();
if (!['admin', 'team_lead'].includes(me.role)) location.href = '/Outreach/registration';
Shell.renderNav({ active: 'volunteers', user: me });
const isAdmin = me.role === 'admin';
const $ = (s) => document.querySelector(s);
const view = $('#view');
const setHead = (t, s = '', actions = '') => { $('#title').textContent = t; $('#subtitle').textContent = s; $('#headActions').innerHTML = actions; };
const filters = { q: '', status: '' };
let listCache = null;

function route() {
    const h = location.hash || '#list';
    if (h.startsWith('#volunteer/')) return renderRecord(h.slice(11));
    renderList();
}
window.addEventListener('hashchange', route);

async function renderList() {
    setHead('Volunteers', '', isAdmin ? `<button class="btn ghost sm" id="exportBtn"><i class="fas fa-download"></i> Export CSV</button><a class="btn sm" href="/Outreach/admin.html"><i class="fas fa-plus"></i> Invite</a>` : '');
    if (!listCache) view.innerHTML = '<div class="empty">Loading…</div>';
    let r;
    try { r = await Shell.api('volunteers', { query: filters }); } catch (err) { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; return; }
    listCache = r;
    const c = r.counts;
    $('#subtitle').textContent = `${c.total} volunteers · ${c.incomplete} need attention`;
    const chip = (key, label) => `<span class="chip ${filters.status === key ? 'on' : ''}" data-status="${key}">${label}</span>`;
    const rowDesc = (v) => `${Shell.roleLabel(v.role)}${v.team ? ' · ' + Shell.escape(v.team) : ''}`;
    const progBar = (s) => { const n = [s.details_complete, s.photo_complete, s.signature_status === 'signed'].filter(Boolean).length; return `<span title="${n}/3 steps" style="display:inline-flex;gap:3px">${[0, 1, 2].map(i => `<i style="width:16px;height:6px;border-radius:3px;background:${i < n ? '#48BB78' : '#E2E8F0'};display:inline-block"></i>`).join('')}</span>`; };
    view.innerHTML = `
      <div class="kpis">
        <div class="kpi" data-status=""><div class="l">Total</div><div class="v">${c.total}</div></div>
        <div class="kpi" data-status="complete"><div class="l">Fully registered</div><div class="v ok">${c.complete}</div></div>
        <div class="kpi" data-status="needs_signing"><div class="l">Needs signing</div><div class="v warn">${c.needs_signing}</div></div>
        <div class="kpi" data-status="blocked"><div class="l">Blocked</div><div class="v bad">${c.blocked}</div></div>
      </div>
      <input class="input" id="search" placeholder="Search name or email…" value="${Shell.escape(filters.q)}" style="margin-bottom:10px">
      <div class="chips" style="margin-bottom:12px">${chip('', 'All')}${chip('needs_signing', 'Needs signing')}${chip('incomplete', 'Incomplete')}${chip('complete', 'Complete')}${chip('blocked', 'Blocked')}</div>
      ${r.volunteers.length === 0 ? '<div class="empty">No volunteers match.</div>' : ''}
      ${r.volunteers.map(v => `<a class="row-card" href="#volunteer/${v.id}" style="${v.is_active ? '' : 'opacity:.55'}"><span class="avatar">${Shell.escape(Shell.initials(v.full_name))}</span><div><b>${Shell.escape(v.full_name)}</b><small>${rowDesc(v)}</small></div><div class="r">${v.is_active ? Shell.statusChip(v.state) : '<span class="st bad">Blocked</span>'}<br><span class="small muted">${progBar(v.state)}</span></div></a>`).join('')}
      <table class="table"><thead><tr><th>Volunteer</th><th>Role</th><th>Team</th><th>Registration</th><th>Policies</th><th>Status</th></tr></thead><tbody>
        ${r.volunteers.map(v => `<tr data-id="${v.id}" style="${v.is_active ? '' : 'opacity:.55'}"><td><div class="person"><span class="avatar">${Shell.escape(Shell.initials(v.full_name))}</span><div><b>${Shell.escape(v.full_name)}</b><small>${Shell.escape(v.email)}</small></div></div></td><td>${Shell.roleLabel(v.role)}</td><td>${Shell.escape(v.team || '—')}</td><td>${progBar(v.state)}</td><td>${Shell.statusChip(v.state)}</td><td>${v.is_active ? '<span class="st ok">Active</span>' : '<span class="st bad">Blocked</span>'}</td></tr>`).join('')}
      </tbody></table>`;
    let t; $('#search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { filters.q = e.target.value.trim(); renderList(); }, 250); });
    view.querySelectorAll('[data-status]').forEach(el => el.addEventListener('click', () => { filters.status = el.dataset.status; renderList(); }));
    view.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { location.hash = `#volunteer/${tr.dataset.id}`; }));
    const ex = $('#exportBtn'); if (ex) ex.onclick = () => Shell.download('export', {}, `volunteers-${new Date().toISOString().slice(0, 10)}.csv`).catch(e => Shell.toast(e.message, 'error'));
}

async function renderRecord(id) {
    setHead('Volunteer', '', `<a class="btn ghost sm" href="#list"><i class="fas fa-arrow-left"></i> All volunteers</a>`);
    view.innerHTML = '<div class="empty">Loading…</div>';
    let r; try { r = await Shell.api('volunteer', { query: { id } }); } catch (err) { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; return; }
    const { user: u, state: s, signatures } = r;
    setHead(u.full_name, `${Shell.roleLabel(u.role)} · Volunteer #${String(u.volunteer_number || 0).padStart(4, '0')}`, `<a class="btn ghost sm" href="#list"><i class="fas fa-arrow-left"></i> Back</a>`);
    const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #EDF2F7"><span class="muted">${k}</span><b style="text-align:right">${v || '—'}</b></div>`;
    view.innerHTML = `
      ${!u.is_active ? '<div class="banner"><i class="fas fa-ban"></i> This account is blocked and cannot log in.</div>' : ''}
      <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span class="avatar lg" id="recAvatar">${Shell.escape(Shell.initials(u.full_name))}</span>
        <div style="flex:1;min-width:200px">${Shell.statusChip(s)} ${s.registration_complete ? '<span class="st ok">Registration complete</span>' : '<span class="st warn">Registration incomplete</span>'}<br>
          <span class="small muted">${u.email}${u.mobile_phone ? ' · ' + Shell.escape(u.mobile_phone) : ''}</span></div>
        <div class="actions">
          ${u.has_photo ? `<button class="btn ghost sm" id="dlPhoto"><i class="fas fa-download"></i> Download photo</button>` : '<span class="st mute">No photo yet</span>'}
          ${isAdmin ? `<button class="btn ghost sm" id="upPhoto"><i class="fas fa-camera"></i> ${u.has_photo ? 'Replace' : 'Upload'} photo</button><input type="file" id="upInput" accept="image/*" class="hidden">` : ''}
        </div>
      </div>
      <div class="card"><h3>Details ${isAdmin ? '<button class="btn ghost sm" id="editBtn" style="float:right"><i class="fas fa-pen"></i> Edit</button>' : ''}</h3>
        ${row('Date of birth', Shell.escape(u.date_of_birth ? Shell.fmtDate(u.date_of_birth) : ''))}${row('Mobile', Shell.escape(u.mobile_phone))}${row('Team', Shell.escape(u.team))}${row('Next of kin', Shell.escape(u.next_of_kin_name))}${row('Next of kin phone', Shell.escape(u.next_of_kin_phone))}${row('Email', Shell.escape(u.email))}${row('Username', Shell.escape(u.username))}${row('Joined', Shell.fmtDate(u.created_at))}${row('Last login', u.last_login ? Shell.fmtDate(u.last_login) : 'Never')}
      </div>
      <div class="card"><h3>Signature history</h3>
        ${signatures.length === 0 ? '<p class="muted small">Not signed yet.</p>' : signatures.map(g => `<div class="small" style="padding:8px 0;border-bottom:1px solid #EDF2F7"><b>${Shell.fmtDate(g.signed_at)}</b> · signed as "${Shell.escape(g.typed_name)}" · valid until ${Shell.fmtDate(g.expires_at)} · ${g.version_ids.length} policies<br><span class="muted">${Shell.escape(g.ip_address || '')}</span></div>`).join('')}
        ${s.signature_status === 'outdated' ? `<p class="small" style="color:var(--warn);margin-top:8px">Needs re-signing: ${Shell.escape(s.outdated_policies.join(', '))}</p>` : ''}
      </div>
      ${isAdmin && u.id !== me.id ? `<div class="card"><h3>Account</h3><div class="actions">
        <button class="btn ${u.is_active ? 'ghost' : ''} sm" id="blockBtn"><i class="fas ${u.is_active ? 'fa-ban' : 'fa-check'}"></i> ${u.is_active ? 'Block login' : 'Unblock'}</button>
        <button class="btn danger sm" id="deleteBtn"><i class="fas fa-trash"></i> Delete account</button></div>
        <p class="muted small" style="margin:10px 0 0">Block keeps their details and signature history. Delete removes everything permanently; prefer Block if you may need to prove they signed the policies.</p></div>` : ''}`;
    if (u.has_photo) {
        fetch(Shell.apiUrl('photo', { id: u.id }), { headers: { Authorization: `Bearer ${Shell.getToken()}` } }).then(async res => { if (res.ok) $('#recAvatar').innerHTML = `<img src="${URL.createObjectURL(await res.blob())}" style="width:100%;height:100%;object-fit:cover">`; }).catch(() => {});
        $('#dlPhoto').onclick = () => Shell.download('photo', { id: u.id }, `HAUK-${String(u.volunteer_number || 0).padStart(4, '0')}-${u.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`).catch(e => Shell.toast(e.message, 'error'));
    }
    if (isAdmin) {
        $('#upPhoto').onclick = () => $('#upInput').click();
        $('#upInput').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const b64 = await squareJpeg(f, 400); await Shell.api('upload-photo', { method: 'POST', body: { user_id: u.id, photo: b64 } }); Shell.toast('Photo saved'); renderRecord(id); } catch (err) { Shell.toast(err.message, 'error'); } };
        $('#editBtn').onclick = () => openEdit(u, r.teams || null);
        const bb = $('#blockBtn'); if (bb) bb.onclick = async () => { try { await Shell.api(u.is_active ? 'block' : 'unblock', { method: 'POST', body: { user_id: u.id } }); Shell.toast(u.is_active ? 'Login blocked' : 'Unblocked'); listCache = null; renderRecord(id); } catch (err) { Shell.toast(err.message, 'error'); } };
        const db = $('#deleteBtn'); if (db) db.onclick = () => openDelete(u);
    }
}

function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('open'); }
function closeModal() { $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

const TEAMS = ['Bolton', 'Manchester', 'Bury', 'Liverpool', 'Wigan', 'Oldham', 'Glasgow', 'Leigh', 'Other'];
function openEdit(u) {
    openModal(`<form id="editForm"><h2>Edit ${Shell.escape(u.full_name)}</h2>
      <label class="field"><span>Full name</span><input class="input" name="full_name" value="${Shell.escape(u.full_name)}" required></label>
      <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${Shell.escape(u.email)}" required></label>
      <label class="field"><span>Role</span><select class="select" name="role">${['volunteer', 'team_lead', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${Shell.roleLabel(r)}</option>`).join('')}</select></label>
      <label class="field"><span>Date of birth</span><input class="input" type="date" name="date_of_birth" value="${Shell.escape(u.date_of_birth || '')}"></label>
      <label class="field"><span>Mobile</span><input class="input" type="tel" name="mobile_phone" value="${Shell.escape(u.mobile_phone || '')}"></label>
      <label class="field"><span>Team</span><select class="select" name="team"><option value="">—</option>${TEAMS.map(t => `<option ${u.team === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Next of kin name</span><input class="input" name="next_of_kin_name" value="${Shell.escape(u.next_of_kin_name || '')}"></label>
      <label class="field"><span>Next of kin phone</span><input class="input" type="tel" name="next_of_kin_phone" value="${Shell.escape(u.next_of_kin_phone || '')}"></label>
      <div class="actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="cancelEdit">Cancel</button></div></form>`);
    $('#cancelEdit').onclick = closeModal;
    $('#editForm').onsubmit = async (e) => {
        e.preventDefault();
        const body = { user_id: u.id };
        for (const [k, v] of new FormData(e.target).entries()) { if (v !== '' || ['full_name', 'email', 'role'].includes(k)) body[k] = v; }
        try { await Shell.api('admin-update-volunteer', { method: 'POST', body }); closeModal(); Shell.toast('Saved'); listCache = null; renderRecord(u.id); } catch (err) { Shell.toast(err.message, 'error'); }
    };
}

function openDelete(u) {
    openModal(`<form id="delForm"><h2 style="color:var(--bad)">Delete ${Shell.escape(u.full_name)}?</h2>
      <p class="small">This permanently removes their account, details, photo and signature history. It cannot be undone. If you only want to stop them logging in, use Block instead.</p>
      <label class="field"><span>Type their full name to confirm</span><input class="input" name="confirm_name" placeholder="${Shell.escape(u.full_name)}" required autocomplete="off"></label>
      <div class="actions"><button class="btn danger" type="submit">Delete permanently</button><button class="btn ghost" type="button" id="cancelDel">Cancel</button></div></form>`);
    $('#cancelDel').onclick = closeModal;
    $('#delForm').onsubmit = async (e) => {
        e.preventDefault();
        try { await Shell.api('delete-volunteer', { method: 'POST', body: { user_id: u.id, confirm_name: e.target.confirm_name.value } }); closeModal(); Shell.toast('Account deleted'); listCache = null; location.hash = '#list'; } catch (err) { Shell.toast(err.message, 'error'); }
    };
}

function squareJpeg(file, size) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const side = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
            const c = document.createElement('canvas'); c.width = size; c.height = size;
            c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
            let q = 0.85, b64; do { b64 = c.toDataURL('image/jpeg', q).split(',')[1]; q -= 0.1; } while (b64.length * 0.75 > 280000 && q > 0.3);
            URL.revokeObjectURL(img.src); resolve(b64);
        };
        img.onerror = () => reject(new Error('bad image')); img.src = URL.createObjectURL(file);
    });
}

route();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify**

With `npm run dev`, log in as an admin, open http://localhost:3000/Outreach/volunteers. At desktop width and at 390 px:
1. Stat tiles show counts; clicking "Needs signing" filters the list; search narrows by name.
2. Clicking a row opens the record with details, signature history and a photo if one exists.
3. Edit changes team and role and the record refreshes.
4. Block greys the volunteer in the list; Unblock restores. Block button is absent on your own record.
5. Delete with the wrong name shows an error; with the right name returns to the list without them.
6. Export CSV downloads a file whose first line is the header from Task 9.
7. Log in as a Team Lead: list and record visible, no Edit, Block, Delete, Export or Upload buttons.

- [ ] **Step 3: Commit**

```bash
git add Outreach/volunteers.html
git commit -m "Add volunteers list and record page"
```

---

### Task 14: Policy editor page

**Files:**
- Create: `Outreach/policies-admin.html`

**Interfaces:**
- Consumes: `Shell`; actions `policies-admin`, `policy-save`, `policy-reorder`, `policy-retire` (Task 10).

- [ ] **Step 1: Write the page**

Create `Outreach/policies-admin.html`:

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Edit Policies - Homeless Aid UK</title>
<meta name="theme-color" content="#1A2332">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/Outreach/registration.css">
<style>
  .editor { min-height: 320px; border: 1.5px solid #CBD5E0; border-radius: 12px; padding: 12px; background: #fff; outline: none; }
  .editor:focus { border-color: var(--navy); }
  .toolbar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .toolbar button { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
<div class="app">
  <div id="shellNav"></div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    <header class="topbar" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><h1>Policies</h1><p id="subtitle">Saving a policy creates a new version and every volunteer must re-sign</p></div>
      <button class="btn sm" id="newBtn"><i class="fas fa-plus"></i> New policy</button>
    </header>
    <main class="main" id="view"><div class="empty">Loading…</div></main>
  </div>
</div>
<div class="modal-bg" id="modal"><div class="modal" id="modalBody" style="max-width:860px"></div></div>

<script src="/Outreach/registration-shell.js"></script>
<script>
const me = Shell.requireAuth();
if (me.role !== 'admin') location.href = '/Outreach/registration';
Shell.renderNav({ active: 'policies-admin', user: me });
const $ = (s) => document.querySelector(s);
const view = $('#view');
let policies = [];

async function load() {
    try { policies = (await Shell.api('policies-admin')).policies; } catch (err) { view.innerHTML = `<div class="empty">${Shell.escape(err.message)}</div>`; return; }
    if (policies.length === 0) { view.innerHTML = '<div class="empty">No policies yet. Click New policy, or run the seed script.</div>'; return; }
    view.innerHTML = policies.map((p, i) => `
      <div class="card" style="display:flex;gap:12px;align-items:center;${p.is_active ? '' : 'opacity:.6'}">
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn ghost sm" data-move="${p.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
          <button class="btn ghost sm" data-move="${p.id}" data-dir="1" ${i === policies.length - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
        </div>
        <div style="flex:1;min-width:0"><b>${Shell.escape(p.title)}</b> ${p.is_active ? '' : '<span class="st mute">Retired</span>'}<br>
          <span class="small muted">${p.current_version ? `Version ${p.current_version.version} · ${Shell.fmtDate(p.current_version.created_at)}${p.current_version.change_note ? ' · ' + Shell.escape(p.current_version.change_note) : ''}` : 'No text yet'}</span></div>
        <div class="actions">
          <button class="btn ghost sm" data-edit="${p.id}"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn ghost sm" data-retire="${p.id}" data-active="${p.is_active ? 0 : 1}">${p.is_active ? 'Retire' : 'Restore'}</button>
        </div>
      </div>`).join('');
    view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(policies.find(p => p.id === b.dataset.edit)));
    view.querySelectorAll('[data-retire]').forEach(b => b.onclick = async () => {
        const p = policies.find(x => x.id === b.dataset.retire);
        if (p.is_active && !window.confirm(`Retire "${p.title}"? Volunteers will no longer see it or need to sign it.`)) return;
        try { await Shell.api('policy-retire', { method: 'POST', body: { policy_id: p.id, is_active: b.dataset.active === '1' } }); load(); } catch (err) { Shell.toast(err.message, 'error'); }
    });
    view.querySelectorAll('[data-move]').forEach(b => b.onclick = async () => {
        const ids = policies.map(p => p.id); const i = ids.indexOf(b.dataset.move); const j = i + Number(b.dataset.dir);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try { await Shell.api('policy-reorder', { method: 'POST', body: { order: ids } }); load(); } catch (err) { Shell.toast(err.message, 'error'); }
    });
}

function openEditor(p) {
    $('#modalBody').innerHTML = `
      <form id="polForm"><h2>${p ? 'Edit policy' : 'New policy'}</h2>
        <label class="field"><span>Title</span><input class="input" name="title" required value="${Shell.escape(p?.title || '')}"></label>
        <div class="field"><span>Policy text</span>
          <div class="toolbar">
            <button type="button" data-cmd="formatBlock" data-val="h2">Heading</button>
            <button type="button" data-cmd="formatBlock" data-val="h3">Subheading</button>
            <button type="button" data-cmd="formatBlock" data-val="p">Paragraph</button>
            <button type="button" data-cmd="bold"><b>B</b></button>
            <button type="button" data-cmd="italic"><i>I</i></button>
            <button type="button" data-cmd="insertUnorderedList">• List</button>
            <button type="button" data-cmd="insertOrderedList">1. List</button>
          </div>
          <div class="editor policy-body" id="editor" contenteditable="true">${p?.current_version?.body_html || '<p></p>'}</div>
        </div>
        ${p ? `<label class="field"><span>What changed? (shown to volunteers when they re-sign)</span><input class="input" name="change_note" maxlength="300" placeholder="e.g. Updated safeguarding lead contact details"></label>
        <div class="banner"><i class="fas fa-triangle-exclamation"></i><div>Saving creates version ${(p.current_version?.version || 0) + 1}. Every volunteer will need to read and sign again.</div></div>` : ''}
        <div class="actions"><button class="btn" type="submit">${p ? 'Save new version' : 'Create policy'}</button><button class="btn ghost" type="button" id="cancelPol">Cancel</button></div>
      </form>`;
    $('#modal').classList.add('open');
    $('#cancelPol').onclick = () => $('#modal').classList.remove('open');
    document.querySelectorAll('.toolbar button').forEach(b => b.onclick = () => { $('#editor').focus(); document.execCommand(b.dataset.cmd, false, b.dataset.val || null); });
    $('#polForm').onsubmit = async (e) => {
        e.preventDefault();
        const body = { title: e.target.title.value, body_html: $('#editor').innerHTML };
        if (p) { body.policy_id = p.id; body.change_note = e.target.change_note.value; }
        try { await Shell.api('policy-save', { method: 'POST', body }); $('#modal').classList.remove('open'); Shell.toast(p ? 'New version saved' : 'Policy created'); load(); } catch (err) { Shell.toast(err.message, 'error'); }
    };
}
$('#newBtn').onclick = () => openEditor(null);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
load();
</script>
</body>
</html>
```

`document.execCommand` is deprecated but still works in every current browser and is enough for headings, bold, italic and lists. The server sanitises whatever the editor produces.

- [ ] **Step 2: Verify**

With `npm run dev`, as admin open http://localhost:3000/Outreach/policies:
1. New policy with a heading, paragraph and list saves and appears in the list as version 1.
2. Edit it, add a change note, save: list shows version 2 with the note. Log in as a volunteer who had signed: their Policies page shows the "Updated since you signed" banner naming this policy.
3. Up/down reorders; Retire greys it and removes it from the volunteer's list; Restore brings it back.
4. Paste text containing a `<script>` tag into the editor and save; reopen and confirm it is gone.

- [ ] **Step 3: Commit**

```bash
git add Outreach/policies-admin.html
git commit -m "Add policy editor page"
```

---

### Task 15: Dashboard banner and navigation link

**Files:**
- Modify: `Outreach/dashboard.html` (nav links near line 724, and the top of the dashboard container)

**Interfaces:**
- Consumes: action `me` (Task 6).

- [ ] **Step 1: Add the nav link**

Find the element `<div class="nav-links" id="navLinks">` in `Outreach/dashboard.html`. Inside it, add as the first child:

```html
<a href="/Outreach/registration" class="nav-link"><i class="fas fa-user-check"></i> My Registration</a>
<a href="/Outreach/volunteers" class="nav-link" id="navVolunteers" style="display:none"><i class="fas fa-users"></i> Volunteers</a>
```

Use whatever class the existing links in that container use instead of `nav-link` if it differs. Read the surrounding lines first.

- [ ] **Step 2: Add the banner**

Find `<div class="dashboard-container">`. Insert as its first child:

```html
<div id="registrationBanner" style="display:none;background:#FFFAF0;border:1px solid #F6AD55;color:#C05621;border-radius:12px;padding:12px 14px;margin-bottom:16px;align-items:center;gap:10px">
    <i class="fas fa-triangle-exclamation"></i>
    <div style="flex:1"><b>Your registration is incomplete.</b> <span id="registrationBannerText"></span></div>
    <a href="/Outreach/registration" style="background:#1A2332;color:#fff;padding:8px 12px;border-radius:10px;text-decoration:none;font-weight:600;white-space:nowrap">Complete now</a>
</div>
```

- [ ] **Step 3: Add the script**

Just before the closing `</body>` tag of `Outreach/dashboard.html`, add:

```html
<script>
(async function () {
    const token = localStorage.getItem('outreachToken') || localStorage.getItem('outreach_token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (['admin', 'team_lead'].includes(payload.role)) document.getElementById('navVolunteers').style.display = '';
        const res = await fetch('/api/registration?action=me', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) return;
        const data = await res.json();
        const s = data.state;
        if (s.registration_complete) return;
        const missing = [];
        if (!s.details_complete) missing.push('your details');
        if (!s.photo_complete) missing.push('a photo');
        if (s.signature_status !== 'signed') missing.push(s.signature_status === 'none' ? 'policy signature' : 'policy re-signing');
        document.getElementById('registrationBannerText').textContent = 'Still needed: ' + missing.join(', ') + '.';
        document.getElementById('registrationBanner').style.display = 'flex';
    } catch (e) { console.warn('Registration banner skipped', e); }
})();
</script>
```

- [ ] **Step 4: Verify**

Open http://localhost:3000/Outreach/dashboard.html as an incomplete volunteer: banner shows with the right missing items and no Volunteers link. As admin: Volunteers link appears. As a complete volunteer: no banner.

- [ ] **Step 5: Commit**

```bash
git add Outreach/dashboard.html
git commit -m "Show registration banner and volunteers link on dashboard"
```

---

### Task 16: Seed policies from Word documents

**Files:**
- Create: `scripts/seed-policies.js`
- Test: `tests/seed-policies.test.js`

**Interfaces:**
- Consumes: `sanitizeHtml` (Task 4), `createRegistrationDb` (Task 6), `mammoth` (dev dependency from Task 2).
- Produces: `node scripts/seed-policies.js "<folder>"` which inserts each mapped `.docx` as a policy with version 1, skipping slugs that already exist. Exports `POLICY_FILES` and `docxToHtml(path)` for testing.

- [ ] **Step 1: Write failing test**

Create `tests/seed-policies.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `../scripts/seed-policies`.

- [ ] **Step 3: Implement**

Create `scripts/seed-policies.js`:

```js
#!/usr/bin/env node
// Usage: node scripts/seed-policies.js "C:/Users/Ben-Work/Desktop/Personal/Homeless Aid UK/Policies"
// Reads .env for SUPABASE_URL and SUPABASE_ANON_KEY. Inserts missing policies as version 1.
const fs = require('fs');
const path = require('path');
const { sanitizeHtml } = require('../utils/sanitize-html');

const POLICY_FILES = [
    { slug: 'volunteer-expectations', title: 'Volunteer Expectations', file: 'Volunteer_Expectations_HOMELESS_AID_UK_CIC.docx' },
    { slug: 'safeguarding', title: 'Safeguarding Policy', file: 'CIC Tools/Safeguarding_Policy_HOMELESS_AID_UK_CIC.docx' },
    { slug: 'data-protection', title: 'Data Protection Policy', file: 'CIC Tools/Data_Protection_Policy_HOMELESS_AID_UK_CIC.docx' },
    { slug: 'equal-opportunities', title: 'Equal Opportunities Policy', file: 'CIC Tools/Equal_Opportunities_Policy_HOMELESS_AID_UK_CIC.docx' },
    { slug: 'complaints-procedure', title: 'Complaints Procedure', file: 'CIC Tools/Complaints_Procedure_HOMELESS_AID_UK_CIC.docx' },
    { slug: 'soup-kitchen-risk-assessment', title: 'Soup Kitchen Risk Assessment', file: 'CIC Tools/Risk Assessment for Homeless Aid UK Soup Kitchen.docx' }
];

function planInserts(files, existing) {
    const have = new Set(existing.map(p => p.slug));
    return files.map((p, i) => ({ ...p, sort_order: i + 1 })).filter(p => !have.has(p.slug));
}

async function docxToHtml(filePath) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.convertToHtml({ path: filePath }, { styleMap: ['p[style-name="Title"] => h1:fresh', 'p[style-name="Heading 1"] => h2:fresh', 'p[style-name="Heading 2"] => h3:fresh'] });
    return sanitizeHtml(value);
}

function loadEnv() {
    const envFile = path.resolve(__dirname, '..', '.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

async function main() {
    const folder = process.argv[2];
    if (!folder) { console.error('Usage: node scripts/seed-policies.js <policies-folder>'); process.exit(1); }
    loadEnv();
    const { createSupabaseClient } = require('../utils/supabase');
    const { createRegistrationDb } = require('../utils/registration-db');
    const db = createRegistrationDb(createSupabaseClient());
    const existing = await db.listAllPolicies();
    const plan = planInserts(POLICY_FILES, existing);
    if (plan.length === 0) { console.log('Nothing to seed; all slugs exist.'); return; }
    for (const p of plan) {
        const full = path.join(folder, p.file);
        if (!fs.existsSync(full)) { console.warn(`SKIP ${p.slug}: file not found: ${full}`); continue; }
        const html = await docxToHtml(full);
        if (!html.replace(/<[^>]+>/g, '').trim()) { console.warn(`SKIP ${p.slug}: converted to empty text`); continue; }
        const policy = await db.insertPolicy({ slug: p.slug, title: p.title, sort_order: p.sort_order });
        await db.insertPolicyVersion({ policy_id: policy.id, version: 1, body_html: html, change_note: 'Initial version', created_by: null });
        console.log(`OK   ${p.slug} (${html.length} chars)`);
    }
}

module.exports = { POLICY_FILES, planInserts, docxToHtml };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Dry-run the conversion on one file**

```bash
node -e "require('./scripts/seed-policies').docxToHtml('C:/Users/Ben-Work/Desktop/Personal/Homeless Aid UK/Policies/CIC Tools/Data_Protection_Policy_HOMELESS_AID_UK_CIC.docx').then(h => console.log(h.slice(0, 600)))"
```

Expected: readable HTML starting with a heading, no `<span>` or `style=` attributes.

- [ ] **Step 6: Seed**

The Volunteer Expectations document does not exist yet; the script warns and skips it. Add it later by rerunning the script once the file exists at the path in `POLICY_FILES`, or create it in the policy editor.

```bash
node scripts/seed-policies.js "C:/Users/Ben-Work/Desktop/Personal/Homeless Aid UK/Policies"
```

Expected: `OK` for five policies, `SKIP volunteer-expectations`. Open http://localhost:3000/Outreach/policies as admin and confirm all five appear in order and read cleanly. Fix formatting in the editor if the conversion left oddities.

- [ ] **Step 7: Commit**

```bash
git add scripts/seed-policies.js tests/seed-policies.test.js
git commit -m "Add policy seeding script from Word documents"
```

---

### Task 17: Deploy and phone test

**Files:**
- Modify: `STRUCTURE.md` (function list and new pages)
- Modify: `README.md` (one paragraph under Outreach Portal)

- [ ] **Step 1: Full test run and function count**

```bash
npm test
find api -name "*.js" | wc -l
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('vercel.json ok')"
git status --short
```

Expected: all tests pass, `12`, `vercel.json ok`, clean tree.

- [ ] **Step 2: Update docs**

In `STRUCTURE.md`, replace the `api/` tree so it lists `api/registration/index.js` and no longer lists `send-invitation-email.js`, and add the three new Outreach pages. In `README.md`, under the Outreach Portal section, add:

```markdown
### Volunteer Registration
Volunteers complete their details, upload a photo and sign all policies with one signature at `/Outreach/registration`. Team Leads and Admins see everyone at `/Outreach/volunteers`; Admins edit policies at `/Outreach/policies`. Signatures expire after 12 months or when any policy changes. See `docs/superpowers/specs/2026-10-13-volunteer-registration-design.md`.
```

Commit: `git commit -am "Document Volunteer Registration"`.

- [ ] **Step 3: Push**

Confirm with the user that they are ready for the live site to change, then:

```bash
git push origin main
```

Vercel deploys from `main`. Watch the deployment in the Vercel dashboard until it shows Ready. No new environment variables are needed.

- [ ] **Step 4: Live smoke test**

```bash
curl -s https://www.homelessaid.co.uk/api/registration/ping
```

Expected: `{"success":true,"ok":true}`. Confirm in the Vercel project that the cron job appears under Settings, Cron Jobs.

- [ ] **Step 5: Phone run-through**

On a real phone:
1. Admin invites a test volunteer from `/Outreach/admin.html`; the invitation email arrives; set a password.
2. Log in on the phone; the dashboard shows the registration banner; tap Complete now.
3. Fill details, take a photo with the camera, read a policy, sign. Home shows three ticks.
4. On desktop as admin: `/Outreach/volunteers` shows them complete; download their photo; it opens as a square JPEG.
5. Edit a policy with a change note. On the phone, Policies shows the "Updated since you signed" banner; re-sign.
6. Block the test volunteer; confirm login fails; unblock; delete with name confirmation.
7. Add to home screen on the phone; it opens straight to My Registration.

Record anything that fails as a follow-up; do not leave the test volunteer in the live database.
