module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // Check if environment variables are configured
        const envCheck = {
            hasUser1: !!process.env.OUTREACH_USERNAME_1,
            hasPassword1: !!process.env.OUTREACH_PASSWORD_1,
            hasName1: !!process.env.OUTREACH_NAME_1,
            hasJwtSecret: !!process.env.JWT_SECRET,
            user1Value: process.env.OUTREACH_USERNAME_1 || 'Not set',
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        };
        
        return res.status(200).json({
            success: true,
            message: 'Auth system test endpoint',
            environment: envCheck
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Test endpoint error',
            error: error.message
        });
    }
};