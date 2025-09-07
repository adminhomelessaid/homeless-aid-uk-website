const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Rate limiting setup
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

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
        
        // Check rate limiting
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const attemptKey = `${clientIp}_${username}`;
        const attempts = loginAttempts.get(attemptKey) || { count: 0, lastAttempt: Date.now() };
        
        // Check if locked out
        if (attempts.count >= MAX_ATTEMPTS) {
            const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
            if (timeSinceLastAttempt < LOCKOUT_TIME) {
                const remainingTime = Math.ceil((LOCKOUT_TIME - timeSinceLastAttempt) / 60000);
                return res.status(429).json({ 
                    success: false, 
                    message: `Too many failed attempts. Please try again in ${remainingTime} minutes.` 
                });
            } else {
                // Reset attempts after lockout period
                loginAttempts.delete(attemptKey);
            }
        }
        
        // Get credentials from environment variables
        const validUsers = [];
        let userIndex = 1;
        
        // Collect all configured users
        while (process.env[`OUTREACH_USERNAME_${userIndex}`]) {
            validUsers.push({
                username: process.env[`OUTREACH_USERNAME_${userIndex}`],
                password: process.env[`OUTREACH_PASSWORD_${userIndex}`],
                name: process.env[`OUTREACH_NAME_${userIndex}`] || `Lead Volunteer ${userIndex}`,
                role: 'lead_volunteer'
            });
            userIndex++;
        }
        
        // Find matching user
        const user = validUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (!user) {
            // Update failed attempts
            attempts.count++;
            attempts.lastAttempt = Date.now();
            loginAttempts.set(attemptKey, attempts);
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        // Verify password
        // In production, passwords should be hashed. For now, comparing directly
        // To upgrade: store hashed passwords in env vars and use bcrypt.compare()
        const isValidPassword = password === user.password;
        
        if (!isValidPassword) {
            // Update failed attempts
            attempts.count++;
            attempts.lastAttempt = Date.now();
            loginAttempts.set(attemptKey, attempts);
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }
        
        // Clear failed attempts on successful login
        loginAttempts.delete(attemptKey);
        
        // Generate JWT token
        const jwtSecret = process.env.JWT_SECRET || 'development_secret_key_change_in_production';
        
        const token = jwt.sign(
            {
                username: user.username,
                name: user.name,
                role: user.role
            },
            jwtSecret,
            {
                expiresIn: '4h', // Token expires in 4 hours
                issuer: 'homelessaid.co.uk'
            }
        );
        
        // Log successful login (without sensitive data)
        console.log(`Successful login for user: ${user.username} at ${new Date().toISOString()}`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                name: user.name,
                role: user.role
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

// Clean up old login attempts periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, attempts] of loginAttempts.entries()) {
        if (now - attempts.lastAttempt > LOCKOUT_TIME) {
            loginAttempts.delete(key);
        }
    }
}, 60 * 60 * 1000); // Clean up every hour