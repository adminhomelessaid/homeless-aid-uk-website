const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow DELETE
    if (req.method !== 'DELETE') {
        return res.status(405).json({ 
            success: false, 
            message: 'Method not allowed' 
        });
    }
    
    try {
        // Verify admin authentication
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
        
        // Extract user ID from request
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID is required' 
            });
        }
        
        // Prevent deleting self
        if (userId === decoded.id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete your own account' 
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Get user details before deletion (for logging)
        const { data: userToDelete, error: fetchError } = await supabase
            .from('outreach_users')
            .select('id, username, email, full_name, role')
            .eq('id', userId)
            .single();
        
        if (fetchError || !userToDelete) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Soft delete - set is_active to false instead of actual deletion
        const { error: deleteError } = await supabase
            .from('outreach_users')
            .update({
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: decoded.id
            })
            .eq('id', userId);
        
        if (deleteError) {
            console.error('User deletion error:', deleteError);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to delete user',
                error: deleteError.message
            });
        }
        
        // Log admin action
        try {
            await AuthUtils.logAuditAction(
                supabase,
                decoded.id,
                userId,
                'user_deleted',
                {
                    deleted_username: userToDelete.username,
                    deleted_email: userToDelete.email,
                    deleted_role: userToDelete.role
                },
                req
            );
        } catch (auditError) {
            console.log('Audit logging failed (non-critical):', auditError.message);
        }
        
        console.log(`User deleted: ${userToDelete.username} by ${decoded.username}`);
        
        return res.status(200).json({
            success: true,
            message: 'User deleted successfully',
            deletedUser: {
                id: userToDelete.id,
                username: userToDelete.username,
                email: userToDelete.email,
                full_name: userToDelete.full_name
            }
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while deleting the user' 
        });
    }
};