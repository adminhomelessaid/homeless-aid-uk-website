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
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password are required' 
            });
        }
        
        // NO RATE LIMITING - TESTING ONLY
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Find user by username or email
        const { data: user, error } = await supabase
            .from('outreach_users')
            .select('*')
            .or(`username.ilike.${username},email.ilike.${username}`)
            .eq('is_active', true)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        // Check if user has set up their password
        if (!user.password_hash) {
            return res.status(400).json({ 
                success: false, 
                message: 'Account setup incomplete. Please check your email for setup instructions.',
                needsSetup: true
            });
        }
        
        // Check if email is verified
        if (!user.email_verified) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email not verified. Please check your email for verification instructions.',
                needsVerification: true
            });
        }
        
        // Verify password
        const isValidPassword = await AuthUtils.verifyPassword(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        // Update last login timestamp
        await supabase
            .from('outreach_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        // Generate JWT token
        const token = AuthUtils.generateJWT(user);
        
        // Log successful login (without sensitive data)
        console.log(`Successful login for user: ${user.username} (${user.role}) at ${new Date().toISOString()}`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.full_name,
                email: user.email,
                role: user.role,
                status: AuthUtils.getUserStatus(user)
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred during login. Please try again.' 
        });
    }
};