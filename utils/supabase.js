// Supabase client utility for Homeless Aid UK
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const createSupabaseClient = () => {
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    // Server-side: prefer the service role key (lets RLS be enabled on every table); fall back to the anon key.
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    
    console.log('Supabase URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('Supabase Key:', supabaseKey ? `Set (${supabaseKey.length} chars)` : 'Missing');
    
    // Clean the key - remove any whitespace, newlines, etc.
    const cleanKey = supabaseKey.replace(/\s+/g, '');
    const cleanUrl = supabaseUrl.replace(/\s+/g, '');
    
    if (!cleanUrl || !cleanKey) {
        console.error('Environment variables check:', {
            SUPABASE_URL: !!process.env.SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        });
        throw new Error(`Missing Supabase environment variables. URL: ${!!cleanUrl}, Key: ${!!cleanKey}`);
    }
    
    console.log('Using cleaned key length:', cleanKey.length);
    
    return createClient(cleanUrl, cleanKey, {
        auth: {
            persistSession: false // Disable session persistence for server-side usage
        }
    });
};

module.exports = { createSupabaseClient };