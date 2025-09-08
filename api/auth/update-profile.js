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
        
        // Extract profile data from request
        const { 
            full_name, 
            email, 
            date_of_birth, 
            address_line1, 
            address_line2, 
            city, 
            postcode, 
            emergency_contact_name, 
            emergency_contact_phone, 
            emergency_contact_relationship 
        } = req.body;
        
        // Validate required fields
        if (!full_name || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Full name and email are required' 
            });
        }
        
        // Validate email format
        if (!AuthUtils.validateEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Prepare update object
        const updateData = {
            full_name: full_name.trim(),
            email: email.toLowerCase().trim(),
            updated_at: new Date().toISOString()
        };
        
        // Add optional fields if provided
        if (date_of_birth) updateData.date_of_birth = date_of_birth;
        if (address_line1) updateData.address_line1 = address_line1.trim();
        if (address_line2) updateData.address_line2 = address_line2.trim();
        if (city) updateData.city = city.trim();
        if (postcode) updateData.postcode = postcode.trim().toUpperCase();
        if (emergency_contact_name) updateData.emergency_contact_name = emergency_contact_name.trim();
        if (emergency_contact_phone) updateData.emergency_contact_phone = emergency_contact_phone.trim();
        if (emergency_contact_relationship) updateData.emergency_contact_relationship = emergency_contact_relationship.trim();
        
        // Update profile in database
        const { data, error } = await supabase
            .from('outreach_users')
            .update(updateData)
            .eq('id', decoded.id)
            .select()
            .single();
        
        if (error) {
            console.error('Profile update error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to update profile'
            });
        }
        
        // Log activity
        try {
            await AuthUtils.logActivity(
                supabase,
                decoded.id,
                'profile_updated',
                { username: decoded.username },
                req
            );
        } catch (logError) {
            console.log('Activity logging failed (non-critical):', logError.message);
        }
        
        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            profile: data
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while updating profile' 
        });
    }
};