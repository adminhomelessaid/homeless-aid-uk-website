const AuthUtils = require('../../utils/auth');
const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow GET
    if (req.method !== 'GET') {
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
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Fetch all users from database
        const { data: users, error } = await supabase
            .from('outreach_users')
            .select(`
                id,
                username,
                email,
                full_name,
                role,
                is_active,
                email_verified,
                created_at,
                updated_at,
                last_login,
                date_of_birth,
                address_line1,
                address_line2,
                city,
                postcode,
                emergency_contact_name,
                emergency_contact_phone,
                emergency_contact_relationship,
                status
            `)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch users',
                error: error.message 
            });
        }
        
        // Format users for frontend
        const formattedUsers = users.map(user => ({
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name || 'No name set',
            role: user.role,
            is_active: user.is_active,
            email_verified: user.email_verified,
            status: user.status || (user.is_active ? 'active' : 'inactive'),
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_login: user.last_login,
            // Additional profile fields
            date_of_birth: user.date_of_birth,
            address: {
                line1: user.address_line1,
                line2: user.address_line2,
                city: user.city,
                postcode: user.postcode
            },
            emergency_contact: {
                name: user.emergency_contact_name,
                phone: user.emergency_contact_phone,
                relationship: user.emergency_contact_relationship
            }
        }));
        
        // Get activity logs for these users
        const { data: activityLogs } = await supabase
            .from('user_activity_log')
            .select('*')
            .in('user_id', users.map(u => u.id))
            .order('timestamp', { ascending: false })
            .limit(100);
        
        console.log(`Listed ${users.length} users for admin: ${decoded.username}`);
        
        return res.status(200).json({
            success: true,
            users: formattedUsers,
            activity_logs: activityLogs || [],
            total: formattedUsers.length
        });
        
    } catch (error) {
        console.error('List users error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while fetching users' 
        });
    }
};