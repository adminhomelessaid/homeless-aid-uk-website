const { createSupabaseClient } = require('../../utils/supabase');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }
    
    try {
        const supabase = createSupabaseClient();
        
        // Check BenAdmin
        const { data: user, error } = await supabase
            .from('outreach_users')
            .select('username, is_active, email_verified, password_hash')
            .eq('username', 'BenAdmin')
            .single();
        
        if (error) {
            return res.status(200).json({
                dbError: error.message,
                timestamp: new Date().toISOString()
            });
        }
        
        // Test password
        const passwordCorrect = user.password_hash ? 
            await bcrypt.compare('Password123!', user.password_hash) : false;
        
        return res.status(200).json({
            userFound: !!user,
            username: user?.username,
            isActive: user?.is_active,
            emailVerified: user?.email_verified,
            hasPasswordHash: !!user?.password_hash,
            passwordMatchesPassword123: passwordCorrect,
            hashFirst20: user?.password_hash?.substring(0, 20),
            timestamp: new Date().toISOString(),
            message: passwordCorrect ? 'Authentication should work!' : 'Password mismatch'
        });
        
    } catch (error) {
        return res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};