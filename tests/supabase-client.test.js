const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseClient } = require('../utils/supabase');

function withEnv(vars, fn) {
    const saved = {};
    for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) { saved[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, vars);
    try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('server client prefers the service role key when set', () => {
    withEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }, () => {
        assert.equal(createSupabaseClient().supabaseKey, 'service-key');
    });
});

test('server client falls back to the anon key', () => {
    withEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }, () => {
        assert.equal(createSupabaseClient().supabaseKey, 'anon-key');
    });
});
