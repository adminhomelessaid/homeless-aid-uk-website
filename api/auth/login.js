const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { createSupabaseClient } = require('../../utils/supabase');
const AuthUtils = require('../../utils/auth');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
    
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Missing credentials' });
        }
        
        // Database authentication
        try {
            const supabase = createSupabaseClient();
            
            // Find user in database
            const { data: user, error } = await supabase
                .from('outreach_users')
                .select('*') // server-side only; tolerates the approval columns not existing yet
                .ilike(String(username).includes('@') ? 'email' : 'username', String(username).trim().replace(/[%_\\]/g, '\\$&')) // email or username, case-insensitive, wildcards escaped
                .single();
            
            if (error || !user || !user.password_hash) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            
            // Verify password
            const isValidPassword = await AuthUtils.verifyPassword(password, user.password_hash);
            
            if (!isValidPassword) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }
            if (user.approval_status === 'pending') {
                return res.status(403).json({ success: false, message: 'Your sign-up is waiting for approval by a team lead. You will get an email when it is approved.' });
            }
            if (!user.is_active) {
                return res.status(403).json({ success: false, message: 'This account is blocked. Please contact an administrator.' });
            }
            
            // Generate JWT for database user
            const jwtSecret = process.env.JWT_SECRET || 'temporary-secret-key';
            const token = jwt.sign(
                { 
                    id: user.id,
                    username: user.username,
                    name: user.full_name,
                    role: user.role
                },
                jwtSecret,
                { 
                    expiresIn: '4h',
                    issuer: 'homelessaid.co.uk'
                }
            );
            
            // Update last login time
            await supabase
                .from('outreach_users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', user.id);
            
            // Log login activity
            try {
                await AuthUtils.logActivity(
                    supabase,
                    user.id,
                    'user_login',
                    { username: user.username, role: user.role },
                    req
                );
            } catch (logError) {
                console.log('Activity logging failed (non-critical):', logError.message);
            }
            
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
                    status: 'active'
                }
            });
            
        } catch (dbError) {
            console.error('Database authentication error:', dbError);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
    } catch (error) {
        // Return error details for debugging
        return res.status(500).json({ 
            success: false, 
            message: 'Login error',
            error: error.message,
            stack: error.stack
        });
    }
};