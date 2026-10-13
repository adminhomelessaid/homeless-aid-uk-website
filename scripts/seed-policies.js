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
