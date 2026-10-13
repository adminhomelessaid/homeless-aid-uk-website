#!/usr/bin/env node
// Usage: node scripts/seed-policies.js "C:/Users/Ben-Work/Desktop/Personal/Homeless Aid UK/Policies"
// Reads .env for SUPABASE_URL and SUPABASE_ANON_KEY. Inserts missing policies as version 1.
const fs = require('fs');
const path = require('path');
const { sanitizeHtml } = require('../utils/sanitize-html');

// Only the Volunteer Agreement is signed; the policies are reference reading.
const POLICY_FILES = [
    { slug: 'volunteer-agreement', title: 'Volunteer Agreement', file: 'Volunteer_Agreement_HOMELESS_AID_UK_CIC.docx', requires_signature: true },
    { slug: 'safeguarding', title: 'Safeguarding Policy', file: 'CIC Tools/Safeguarding_Policy_HOMELESS_AID_UK_CIC.docx', requires_signature: false },
    { slug: 'data-protection', title: 'Data Protection Policy', file: 'CIC Tools/Data_Protection_Policy_HOMELESS_AID_UK_CIC.docx', requires_signature: false },
    { slug: 'equal-opportunities', title: 'Equal Opportunities Policy', file: 'CIC Tools/Equal_Opportunities_Policy_HOMELESS_AID_UK_CIC.docx', requires_signature: false },
    { slug: 'complaints-procedure', title: 'Complaints Procedure', file: 'CIC Tools/Complaints_Procedure_HOMELESS_AID_UK_CIC.docx', requires_signature: false },
    { slug: 'soup-kitchen-risk-assessment', title: 'Soup Kitchen Risk Assessment', file: 'CIC Tools/Risk Assessment for Homeless Aid UK Soup Kitchen.docx', requires_signature: false }
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
    // Keep the signature flag and display order of already-seeded policies in line with this list.
    for (const p of POLICY_FILES.map((x, i) => ({ ...x, sort_order: i + 1 }))) {
        const row = existing.find(e => e.slug === p.slug);
        const wants = p.requires_signature !== false;
        if (row && ((row.requires_signature !== false) !== wants || row.sort_order !== p.sort_order)) {
            await db.updatePolicy(row.id, { requires_signature: wants, sort_order: p.sort_order });
            console.log(`SYNC ${p.slug}: requires_signature=${wants}, order=${p.sort_order}`);
        }
    }
    const plan = planInserts(POLICY_FILES, existing);
    if (plan.length === 0) { console.log('Nothing new to seed; all slugs exist.'); return; }
    for (const p of plan) {
        const full = path.join(folder, p.file);
        if (!fs.existsSync(full)) { console.warn(`SKIP ${p.slug}: file not found: ${full}`); continue; }
        const html = await docxToHtml(full);
        if (!html.replace(/<[^>]+>/g, '').trim()) { console.warn(`SKIP ${p.slug}: converted to empty text`); continue; }
        const policy = await db.insertPolicy({ slug: p.slug, title: p.title, sort_order: p.sort_order, requires_signature: p.requires_signature !== false });
        await db.insertPolicyVersion({ policy_id: policy.id, version: 1, body_html: html, change_note: 'Initial version', created_by: null });
        console.log(`OK   ${p.slug} (${html.length} chars)`);
    }
}

module.exports = { POLICY_FILES, planInserts, docxToHtml };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
