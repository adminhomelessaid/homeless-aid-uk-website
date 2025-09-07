// Supabase client utility for Homeless Aid UK
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const createSupabaseClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables. Please check SUPABASE_URL and SUPABASE_ANON_KEY.');
    }
    
    return createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false // Disable session persistence for server-side usage
        }
    });
};

module.exports = { createSupabaseClient };