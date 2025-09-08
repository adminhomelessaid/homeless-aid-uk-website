module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            message: 'Method not allowed' 
        });
    }
    
    try {
        // For JWT-based authentication, logout is primarily handled client-side
        // by removing the token from localStorage/sessionStorage
        // Server-side logout would require token blacklisting, which adds complexity
        
        // We can add activity logging here if needed
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const AuthUtils = require('../../utils/auth');
                const decoded = AuthUtils.verifyJWT(token);
                
                // Log logout activity
                const { createSupabaseClient } = require('../../utils/supabase');
                const supabase = createSupabaseClient();
                
                await AuthUtils.logActivity(
                    supabase,
                    decoded.id,
                    'user_logout',
                    { username: decoded.username },
                    req
                );
                
                console.log(`User logged out: ${decoded.username}`);
            } catch (error) {
                // Token might be expired or invalid, but that's okay for logout
                console.log('Logout with invalid/expired token');
            }
        }
        
        return res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(200).json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
    }
};