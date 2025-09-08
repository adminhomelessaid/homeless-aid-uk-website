const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');

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
        // Verify authentication
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }
        
        const token = authHeader.substring(7);
        let decoded;
        
        try {
            decoded = AuthUtils.verifyJWT(token);
        } catch (error) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        
        // Extract passwords from request
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Current password and new password are required' 
            });
        }
        
        // Validate new password
        const passwordValidation = AuthUtils.validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(400).json({ 
                success: false, 
                message: passwordValidation.errors.join(', ')
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Get current user from database
        const { data: user, error } = await supabase
            .from('outreach_users')
            .select('id, username, password_hash')
            .eq('id', decoded.id)
            .eq('is_active', true)
            .single();
        
        if (error || !user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Skip current password verification for hardcoded BenAdmin
        if (decoded.username !== 'BenAdmin') {
            // Verify current password
            const isCurrentPasswordValid = await AuthUtils.verifyPassword(currentPassword, user.password_hash);
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Current password is incorrect' 
                });
            }
        }
        
        // Hash new password
        const newPasswordHash = await AuthUtils.hashPassword(newPassword);
        
        // Update password in database
        const { error: updateError } = await supabase
            .from('outreach_users')
            .update({
                password_hash: newPasswordHash,
                updated_at: new Date().toISOString()
            })
            .eq('id', decoded.id);
        
        if (updateError) {
            console.error('Password update error:', updateError);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to update password' 
            });
        }
        
        // Log activity (if logging system exists)
        try {
            await AuthUtils.logActivity(
                supabase,
                decoded.id,
                'password_changed',
                { username: decoded.username },
                req
            );
        } catch (logError) {
            console.log('Activity logging failed (non-critical):', logError.message);
        }
        
        console.log(`Password changed for user: ${decoded.username}`);
        
        return res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while changing password' 
        });
    }
};