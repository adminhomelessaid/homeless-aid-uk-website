const bcrypt = require('bcryptjs');
const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
    
    try {
        const { secretKey } = req.body;
        
        // Simple security check - you can change this secret
        if (secretKey !== 'reset-admin-2025') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        // Initialize Supabase
        const supabase = createSupabaseClient();
        
        // Generate new password hash for "Password123!"
        const newPassword = 'Password123!';
        const newHash = await bcrypt.hash(newPassword, 12);
        
        // Update BenAdmin user
        const { data, error } = await supabase
            .from('outreach_users')
            .update({ 
                password_hash: newHash,
                email_verified: true,
                is_active: true
            })
            .eq('username', 'BenAdmin');
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database update failed',
                error: error.message 
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Password reset successful',
            instructions: 'You can now login with username: BenAdmin and password: Password123!'
        });
        
    } catch (error) {
        console.error('Reset error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Reset failed',
            error: error.message 
        });
    }
};