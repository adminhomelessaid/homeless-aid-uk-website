const jwt = require('jsonwebtoken');

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
        // Verify JWT token
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }
        
        const token = authHeader.substring(7);
        const jwtSecret = process.env.JWT_SECRET || 'development_secret_key_change_in_production';
        
        try {
            jwt.verify(token, jwtSecret, {
                issuer: 'homelessaid.co.uk'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Token has expired. Please login again.' 
                });
            }
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token' 
            });
        }
        
        // Parse query parameters
        const url = new URL(req.url, `http://${req.headers.host}`);
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const location = url.searchParams.get('location');
        
        // For now, return empty logs since we don't have persistent storage
        // In production, this should be replaced with a proper database query
        let logs = [];
        
        // This is a temporary implementation - logs are not persisted between function calls
        // We'll need to implement a proper database solution for production use
        console.log('Attendance list requested - temporary implementation returns empty logs');
        
        // Sort by date (newest first)
        logs.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateB - dateA;
        });
        
        // Apply pagination
        const totalLogs = logs.length;
        const paginatedLogs = logs.slice(offset, offset + limit);
        
        // Return response
        return res.status(200).json({
            success: true,
            logs: paginatedLogs,
            pagination: {
                total: totalLogs,
                limit: limit,
                offset: offset,
                hasMore: offset + limit < totalLogs
            }
        });
        
    } catch (error) {
        console.error('List attendance error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while fetching attendance logs' 
        });
    }
};