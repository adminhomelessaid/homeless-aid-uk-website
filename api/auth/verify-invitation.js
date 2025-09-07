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
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invitation token is required' 
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Find user by invitation token
        const { data: user, error } = await supabase
            .from('outreach_users')
            .select('id, username, email, full_name, role, invitation_token, invitation_sent_at, password_hash, is_active')
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
        
        // Check if invitation is not too old (e.g., 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (new Date(user.invitation_sent_at) < sevenDaysAgo) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invitation token has expired. Please contact an administrator for a new invitation.' 
            });
        }
        
        // Return user information (without sensitive data)
        return res.status(200).json({
            success: true,
            message: 'Invitation token is valid',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
        
    } catch (error) {
        console.error('Verify invitation error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while verifying the invitation' 
        });
    }
};