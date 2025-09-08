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
                message: 'Insufficient permissions' 
            });
        }
        
        // Extract user data
        const { username, email, full_name, role } = req.body;
        
        // Validate required fields
        if (!username || !email || !full_name || !role) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username, email, full name, and role are required' 
            });
        }
        
        // Validate role
        const validRoles = ['admin', 'team_lead', 'volunteer'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid role. Must be admin, team_lead, or volunteer' 
            });
        }
        
        // Validate username
        const usernameValidation = AuthUtils.validateUsername(username);
        if (!usernameValidation.valid) {
            return res.status(400).json({ 
                success: false, 
                message: usernameValidation.errors.join(', ')
            });
        }
        
        // Validate email
        if (!AuthUtils.validateEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email address' 
            });
        }
        
        // Initialize Supabase client
        let supabase;
        try {
            supabase = createSupabaseClient();
            console.log('Supabase client created successfully');
        } catch (supabaseError) {
            console.error('Failed to create Supabase client:', supabaseError);
            return res.status(500).json({ 
                success: false, 
                message: 'Database connection failed',
                error: supabaseError.message
            });
        }
        
        // Check if username already exists
        const { data: existingUsername } = await supabase
            .from('outreach_users')
            .select('username')
            .eq('username', username.toLowerCase())
            .single();
        
        if (existingUsername) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }
        
        // Check if email already exists
        const { data: existingEmail } = await supabase
            .from('outreach_users')
            .select('email')
            .eq('email', email.toLowerCase())
            .single();
        
        if (existingEmail) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already exists' 
            });
        }
        
        // Generate invitation token
        const invitationToken = AuthUtils.generateInvitationToken();
        
        // Create new user
        const newUser = {
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            full_name: full_name,
            role: role,
            invitation_token: invitationToken,
            invitation_sent_at: new Date().toISOString(),
            created_by: decoded.id
        };
        
        console.log('Attempting to create user:', {
            ...newUser,
            invitation_token: '***hidden***' // Don't log sensitive token
        });
        
        const { data: createdUser, error } = await supabase
            .from('outreach_users')
            .insert([newUser])
            .select()
            .single();
        
        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to create user',
                error: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
        }
        
        // Log audit action
        await AuthUtils.logAuditAction(
            supabase,
            decoded.id,
            createdUser.id,
            'user_created',
            {
                username: createdUser.username,
                email: createdUser.email,
                role: createdUser.role
            },
            req
        );
        
        // Send invitation email
        try {
            const invitationUrl = `${req.headers.origin || 'https://homelessaid.co.uk'}/Outreach/setup-password.html?token=${invitationToken}`;
            
            // Call email API
            const emailResponse = await fetch(`${req.headers.origin || 'https://homelessaid.co.uk'}/api/send-invitation-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: createdUser.email,
                    name: createdUser.full_name,
                    username: createdUser.username,
                    role: createdUser.role,
                    invitationUrl: invitationUrl,
                    invitedBy: decoded.name
                })
            });
            
            if (!emailResponse.ok) {
                console.error('Failed to send invitation email');
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            // Continue even if email fails - user can be invited manually
        }
        
        console.log(`User created: ${createdUser.username} (${createdUser.role}) by ${decoded.username}`);
        
        // Return success response (without sensitive data)
        return res.status(201).json({
            success: true,
            message: 'User created successfully and invitation email sent',
            user: {
                id: createdUser.id,
                username: createdUser.username,
                email: createdUser.email,
                full_name: createdUser.full_name,
                role: createdUser.role,
                status: 'pending_setup',
                created_at: createdUser.created_at
            }
        });
        
    } catch (error) {
        console.error('Create user error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while creating the user' 
        });
    }
};