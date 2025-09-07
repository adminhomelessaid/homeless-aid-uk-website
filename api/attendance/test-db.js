const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // Check environment variables
        const envVars = {
            hasSupabaseUrl: !!process.env.SUPABASE_URL,
            hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
            supabaseUrl: process.env.SUPABASE_URL || 'Not set',
            keyLength: process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.length : 0
        };
        
        // Try to create client
        const supabase = createSupabaseClient();
        
        // Test database connection
        const { data, error } = await supabase
            .from('attendance_logs')
            .select('count')
            .limit(1);
        
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Database connection failed',
                error: error.message,
                envVars: envVars
            });
        }
        
        // Try to get table info
        const { data: tableInfo, error: tableError } = await supabase
            .from('attendance_logs')
            .select('*')
            .limit(1);
        
        return res.status(200).json({
            success: true,
            message: 'Database connection successful',
            envVars: envVars,
            tableExists: !tableError,
            sampleData: tableInfo || [],
            tableError: tableError?.message || null
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Test failed',
            error: error.message,
            stack: error.stack
        });
    }
};