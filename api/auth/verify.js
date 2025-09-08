const jwt = require('jsonwebtoken');
const AuthUtils = require('../../utils/auth');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
    
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        try {
            // Verify the JWT token
            const decoded = AuthUtils.verifyJWT(token);
            
            // Check if token is expired (this is handled by jwt.verify, but let's be explicit)
            const currentTime = Math.floor(Date.now() / 1000);
            if (decoded.exp && decoded.exp < currentTime) {
                return res.status(401).json({ success: false, message: 'Token expired' });
            }
            
            // Token is valid - return success with user info
            return res.status(200).json({
                success: true,
                message: 'Token valid',
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    name: decoded.name,
                    role: decoded.role
                }
            });
            
        } catch (jwtError) {
            // Token is invalid or expired
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token',
                error: jwtError.message
            });
        }
        
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error during token verification',
            error: error.message
        });
    }
};