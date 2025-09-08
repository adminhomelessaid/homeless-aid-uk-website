const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow PUT
    if (req.method !== 'PUT') {
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
        
        // Check if user has admin permissions
        if (!AuthUtils.hasPermission(decoded.role, 'manage_users')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Insufficient permissions - Admin access required' 
            });
        }
        
        // Get user ID from URL or body
        const userId = req.query.id || req.body.userId;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID is required' 
            });
        }
        
        const {
            email,
            full_name,
            role,
            date_of_birth,
            status,
            address_line1,
            address_line2,
            city,
            postcode,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship
        } = req.body;
        
        // Validate required fields
        if (!email || !full_name || !role) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email, full name, and role are required' 
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Validate role
        const validRoles = ['admin', 'team_lead', 'volunteer'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid role specified' 
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Check if user exists
        const { data: existingUser, error: fetchError } = await supabase
            .from('outreach_users')
            .select('id, username, email')
            .eq('id', userId)
            .single();
            
        if (fetchError || !existingUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if email is already taken by another user
        if (email !== existingUser.email) {
            const { data: emailCheck } = await supabase
                .from('outreach_users')
                .select('id')
                .eq('email', email.toLowerCase())
                .neq('id', userId)
                .single();
                
            if (emailCheck) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Email address is already in use' 
                });
            }
        }
        
        // Update user
        const updateData = {
            email: email.toLowerCase(),
            full_name,
            role,
            status: status || 'active',
            updated_at: new Date().toISOString(),
            date_of_birth: date_of_birth || null,
            address_line1: address_line1 || null,
            address_line2: address_line2 || null,
            city: city || null,
            postcode: postcode || null,
            emergency_contact_name: emergency_contact_name || null,
            emergency_contact_phone: emergency_contact_phone || null,
            emergency_contact_relationship: emergency_contact_relationship || null
        };
        
        const { data: updatedUser, error } = await supabase
            .from('outreach_users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to update user',
                error: error.message 
            });
        }
        
        // Log the activity
        try {
            await supabase
                .from('user_activity_log')
                .insert({
                    user_id: userId,
                    admin_user_id: decoded.userId,
                    action: 'user_updated',
                    details: `User profile updated by ${decoded.username}`,
                    ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                    user_agent: req.headers['user-agent'],
                    timestamp: new Date().toISOString()
                });
        } catch (logError) {
            console.error('Activity log error:', logError);
        }
        
        console.log(`User ${existingUser.username} updated by admin: ${decoded.username}`);
        
        return res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                full_name: updatedUser.full_name,
                role: updatedUser.role,
                status: updatedUser.status,
                updated_at: updatedUser.updated_at
            }
        });
        
    } catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while updating the user' 
        });
    }
};