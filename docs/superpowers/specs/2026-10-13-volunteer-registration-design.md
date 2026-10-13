# Volunteer Registration: Design

Date: 13 October 2026
Status: Approved in conversation, pending written review
Target: Ship by 16:00 on 13 October 2026

## 1. Purpose

Homeless Aid UK needs a simple, auditable record of each volunteer and
confirmation that they have read and agreed to the organisation's policies.
This is not a full volunteer management system. It covers:

- Volunteer details: full name, date of birth, next of kin name and phone.
- A profile photo, which admins download to produce ID cards offline.
- A list of policies that volunteers can read in the portal.
- One signature per volunteer that covers all current policies, valid for
  twelve months or until any policy changes.
- An admin panel to see every volunteer, their registration state, and to
  edit, block, unblock or delete them.

Success means a volunteer can complete registration on their phone in a few
minutes, and an admin can see at a glance who still needs chasing.

## 2. Where it lives

The feature extends the existing Outreach portal in the homelessaid.co.uk
website. It reuses the portal's login, JWT auth, roles, invitation flow and
Supabase database. No new project, no new auth.

Constraints that shape the design:

- Vercel Hobby plan allows twelve serverless functions. The repo has twelve.
- Supabase free tier. The project pauses after seven idle days.
- Policies currently exist as Word documents and are being edited today.

## 3. Roles

| Capability | Volunteer | Team Lead | Admin |
|---|---|---|---|
| Edit own details and photo | Yes | Yes | Yes |
| Read policies | Yes | Yes | Yes |
| Sign the declaration | Yes | Yes | Yes |
| View all volunteers list | No | Yes | Yes |
| View a volunteer's record and download photo | No | Yes | Yes |
| Edit another volunteer's details and photo | No | No | Yes |
| Block, unblock, delete a volunteer | No | No | Yes |
| Create, edit, reorder, retire policies | No | No | Yes |
| Export volunteer list as CSV | No | No | Yes |

Every action is permission-checked server-side using the existing role in
the JWT. A volunteer can only read or write their own record. Admins cannot
block or delete their own account.

## 4. Data model

### 4.1 Columns added to `outreach_users`

| Column | Type | Notes |
|---|---|---|
| `date_of_birth` | date | nullable |
| `next_of_kin_name` | varchar(100) | nullable |
| `next_of_kin_phone` | varchar(30) | nullable |
| `photo_data` | text | base64 JPEG, 400x400 max, nullable |
| `photo_updated_at` | timestamptz | nullable |
| `volunteer_number` | integer | generated once, unique, for display |

`is_active` already exists and is used for block/unblock.

### 4.2 New table `policies`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `slug` | varchar(60) unique | e.g. `safeguarding` |
| `title` | varchar(150) | |
| `sort_order` | integer | display order |
| `is_active` | boolean | retired policies are hidden and excluded from the declaration |
| `created_at` | timestamptz | |

### 4.3 New table `policy_versions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `policy_id` | uuid fk policies | |
| `version` | integer | 1, 2, 3 per policy |
| `body_html` | text | sanitised HTML |
| `change_note` | varchar(300) | optional, shown to volunteers on re-sign |
| `created_at` | timestamptz | |
| `created_by` | uuid fk outreach_users | |

The current version of a policy is the row with the highest `version`.
Editing a policy always inserts a new version. Old versions are never changed
or deleted.

### 4.4 New table `policy_signatures`

One row per signing event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk outreach_users, on delete cascade | |
| `typed_name` | varchar(100) | what the volunteer typed |
| `signed_at` | timestamptz | |
| `expires_at` | timestamptz | `signed_at` + 12 months |
| `version_ids` | uuid[] | every current policy version at the moment of signing |
| `ip_address` | varchar(45) | |
| `user_agent` | varchar(300) | |

### 4.5 Registration state, computed on read

For a volunteer:

- `details_complete`: date of birth, next of kin name and phone all present.
- `photo_complete`: `photo_data` present.
- `signature_status`, one of:
  - `signed`: latest signature exists, `expires_at` is in the future, and
    `version_ids` contains the current version of every active policy that
    existed at signing, and no active policy has a newer version.
  - `expired`: latest signature exists but `expires_at` has passed.
  - `outdated`: latest signature exists, not expired, but a policy has been
    added or re-versioned since. The response names the changed policies.
  - `none`: no signature.
- `registration_complete`: all three of the above satisfied.

## 5. API

One new serverless function: `api/registration/index.js`. It dispatches on
`req.query.action` or `req.body.action`. All actions except `ping` require a
valid JWT in the `Authorization: Bearer` header.

The existing `api/send-invitation-email.js` moves to
`utils/send-invitation-email.js` and is called directly from
`api/admin/create-user.js`. The function count stays at twelve.

### 5.1 Volunteer actions (any logged-in user, own record only)

| Action | Method | Purpose |
|---|---|---|
| `me` | GET | Own profile, photo flag, registration state, policy list with status |
| `update-me` | POST | Update date of birth, next of kin name and phone |
| `upload-photo` | POST | Body is `{ photo: "<base64 jpeg>" }`. Rejects over 300 KB, non-JPEG, or non-square |
| `delete-photo` | POST | Clears own photo |
| `policies` | GET | Active policies with current version id, title, updated date, body |
| `sign` | POST | Body `{ typed_name, version_ids }`. Rejects if any id is not the current version of an active policy, or if any active policy is missing. Typed name must match full name case-insensitively after trimming |

### 5.2 Team Lead and Admin actions

| Action | Method | Who | Purpose |
|---|---|---|---|
| `volunteers` | GET | Team Lead, Admin | List with registration state. Supports `q`, `status`, `role` filters |
| `volunteer` | GET | Team Lead, Admin | One volunteer's full record including photo and signature history |
| `photo` | GET | Team Lead, Admin | Returns the raw JPEG for download, `Content-Disposition: attachment` |
| `admin-update-volunteer` | POST | Admin | Edit details, role, or upload photo on behalf |
| `block` / `unblock` | POST | Admin | Sets `is_active`. Refuses on own account |
| `delete-volunteer` | POST | Admin | Hard delete. Requires `confirm_name` equal to full name. Refuses on own account. Cascades signatures and attendance user link |
| `export` | GET | Admin | CSV of volunteers and state, no photos |
| `policy-save` | POST | Admin | Create a policy or add a new version to one. Sanitises HTML |
| `policy-reorder` | POST | Admin | Set `sort_order` for all |
| `policy-retire` | POST | Admin | Sets `is_active` false |

### 5.3 System

| Action | Method | Purpose |
|---|---|---|
| `ping` | GET | Runs `select 1` against the database and returns `{ ok: true }`. Called daily by a Vercel cron to keep the free-tier project awake |

### 5.4 Errors

All errors return `{ success: false, message }` with the standard status:
400 validation, 401 no or bad token, 403 wrong role, 404 not found, 409 when
a signature is stale, 413 when a photo is too large.

## 6. Pages

New files in `Outreach/`, built mobile-first with a shared
`Outreach/registration.css` for the new look: dark navy sidebar on desktop,
bottom tab bar on phones, Inter font, brand colours from `styles.css`.

### 6.1 `Outreach/registration.html` (every logged-in user)

Routes by hash so it is one file:

- `#home`: greeting, progress bar, three step cards (details, photo,
  policies) with done or to-do state, one primary Continue button for the next
  incomplete step.
- `#details`: form for date of birth, next of kin name, next of kin phone.
- `#photo`: pick or take a photo, client-side crop to square and resize to
  400x400 JPEG at quality 0.85, preview, upload.
- `#policies`: list of active policies. Tapping one opens it full screen with
  a back button. At the bottom of the list: declaration text, typed name box,
  checkbox acknowledging twelve-month validity, Sign button. Shows signed
  state and expiry when complete, and the reason when a re-sign is needed.
- `#account`: link to existing account page and logout.

### 6.2 `Outreach/volunteers.html` (Team Lead and Admin)

- Stat tiles: total, fully registered, needs signing, blocked.
- Search box and filter chips: All, Needs signing, Incomplete, Blocked.
- Desktop: table with photo, name, email, role, registration progress,
  signature status, actions. Phone: the same rows as stacked cards.
- Export CSV button (Admin).
- Row opens `#volunteer/<id>`: details, photo with Download button, signature
  history, and for Admin: edit form, upload photo, block/unblock, delete with
  type-the-name confirmation and a note recommending block over delete when a
  record may be needed later.

### 6.3 `Outreach/policies-admin.html` (Admin)

- List of policies with order, current version, last updated.
- Edit opens a simple rich text area (bold, headings, lists) with a change
  note field. Saving creates a new version and shows a warning that every
  volunteer will need to re-sign.
- Add policy, reorder by drag or up/down buttons, retire.

### 6.4 Changes to existing pages

- `Outreach/dashboard.html`: a banner "Registration incomplete" linking to
  `registration.html` when the logged-in user is not complete, and a
  navigation link to Volunteers for Team Lead and Admin.
- `vercel.json`: rewrites for the new pages, remove the function entry for
  `send-invitation-email`, add `api/registration/index.js`, add a daily cron
  on `/api/registration?action=ping`.
- `manifest.json`: start URL to the registration page so "Add to home
  screen" lands volunteers in the right place.

## 7. Policy seeding

A one-off script, `scripts/seed-policies.js`, run locally:

1. Reads each `.docx` from a given folder.
2. Converts to HTML with the `mammoth` package.
3. Sanitises the HTML.
4. Inserts a policy and version 1 for each, in a fixed order.

Initial set, in display order:

1. Volunteer Expectations (new document, written today)
2. Safeguarding Policy (CIC version, April 2026)
3. Data Protection Policy
4. Equal Opportunities Policy
5. Complaints Procedure
6. Soup Kitchen Risk Assessment

The older Expanded Safeguarding Policy is not loaded. Any document not ready
by seeding time is added later through the admin policies page.

## 8. Security

- Role checks on every action, server-side.
- HTML from the policy editor and the seed script is sanitised with an
  allowlist before storage.
- Photo uploads are validated for size and JPEG magic bytes.
- Typed name must match the account's full name.
- Signature records store IP and user agent for the audit trail.
- Delete is Admin-only, requires name confirmation, and is logged to the
  console with the acting admin's id.

## 9. Testing

- Unit tests with Node's built-in `node:test` for the registration state
  rules in section 4.5 and for each API action using a stubbed Supabase
  client. Run with `npm test`.
- Manual run-through before deploy, on a phone: invite a test volunteer,
  complete details, upload a photo, read and sign, confirm the admin list
  shows them complete, re-version a policy, confirm they show as outdated.

## 10. Out of scope today

- ID card generation. Cards are produced offline from the downloaded photo.
- Supabase Storage for photos. Photos live in the database. Migrate if the
  volunteer count grows beyond a few thousand.
- Email reminders when a signature is about to expire.
- Redesign of the existing dashboard, attendance and events pages.

## 11. Plan for the day

| Time | Milestone |
|---|---|
| 09:45 | Spec approved, implementation plan written |
| 11:30 | Database migration run, API function built and unit tested |
| 13:30 | Volunteer registration page done |
| 15:00 | Volunteers list and record, policies admin done |
| 16:00 | Policies seeded, deployed, phone test passed |
