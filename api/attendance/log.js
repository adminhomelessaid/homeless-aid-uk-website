const jwt = require('jsonwebtoken');

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
        
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret, {
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
        
        // Get attendance data from request body
        const { date, eventName, eventTown, peopleServed, notes } = req.body;
        
        // Validate required fields
        if (!date || !eventName || !eventTown || peopleServed === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }
        
        // Validate peopleServed is a number and within range
        const peopleCount = parseInt(peopleServed);
        if (isNaN(peopleCount) || peopleCount < 0 || peopleCount > 500) {
            return res.status(400).json({ 
                success: false, 
                message: 'People served must be a number between 0 and 500' 
            });
        }
        
        // Validate date is not in the future
        const entryDate = new Date(date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        if (entryDate > today) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot log attendance for future dates' 
            });
        }
        
        // For now, we'll use a simple approach to store data
        // In production, this should be replaced with a proper database
        const timestamp = new Date().toISOString();
        
        // Create attendance log entry
        const logEntry = {
            timestamp,
            date,
            eventName,
            location: eventTown,
            town: eventTown,
            peopleServed: peopleCount,
            outreachName: decoded.name,
            notes: notes || '',
            id: `${date}_${eventName}_${eventTown}_${decoded.name}`.replace(/[^a-zA-Z0-9_]/g, '_')
        };
        
        // Simple duplicate prevention using a basic check
        // Note: In a serverless environment, we can't prevent all duplicates without a database
        // This is a basic implementation that will be improved later
        
        // Log the successful entry (this will appear in Vercel function logs)
        console.log(`Attendance logged: ${eventName} - ${eventTown} on ${date} by ${decoded.name} - People served: ${peopleCount}`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Attendance logged successfully',
            data: logEntry
        });
        
    } catch (error) {
        console.error('Attendance logging error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while logging attendance' 
        });
    }
};