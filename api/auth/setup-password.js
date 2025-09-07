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
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invitation token and password are required' 
            });
        }
        
        // Validate password
        const passwordValidation = AuthUtils.validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ 
                success: false, 
                message: passwordValidation.errors.join(', ')
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Find user by invitation token
        const { data: user, error } = await supabase
            .from('outreach_users')
            .select('*')
            .eq('invitation_token', token)
            .eq('is_active', true)
            .single();
        
        if (error || !user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired invitation token' 
            });
        }
        
        // Check if password is already set
        if (user.password_hash) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password has already been set for this account' 
            });
        }
        
        // Check if invitation is not too old (7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (new Date(user.invitation_sent_at) < sevenDaysAgo) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invitation token has expired. Please contact an administrator for a new invitation.' 
            });
        }
        
        // Hash the password
        const passwordHash = await AuthUtils.hashPassword(password);
        
        // Update user with password and verify email
        const { error: updateError } = await supabase
            .from('outreach_users')
            .update({
                password_hash: passwordHash,
                email_verified: true,
                password_set_at: new Date().toISOString(),
                invitation_token: null // Remove token after use
            })
            .eq('id', user.id);
        
        if (updateError) {
            console.error('Database error:', updateError);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to set password' 
            });
        }
        
        // Log audit action
        await AuthUtils.logAuditAction(
            supabase,
            user.id, // Self-action
            user.id,
            'password_setup',
            {
                username: user.username,
                email: user.email
            },
            req
        );
        
        console.log(`Password set up for user: ${user.username} (${user.role})`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Password set successfully. You can now log in.',
            redirect: '/Outreach/login.html'
        });
        
    } catch (error) {
        console.error('Setup password error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while setting up the password' 
        });
    }
};