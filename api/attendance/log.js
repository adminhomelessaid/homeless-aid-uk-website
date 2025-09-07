const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

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
        
        // Check for duplicate entry (same event, same date, same user)
        const csvPath = path.join(process.cwd(), 'attendance-logs.csv');
        let existingData = '';
        
        try {
            existingData = await fs.readFile(csvPath, 'utf8');
            
            // Check for duplicate
            const lines = existingData.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
                    if (values && values.length >= 6) {
                        const logDate = values[1].replace(/"/g, '');
                        const logEvent = values[2].replace(/"/g, '');
                        const logTown = values[4].replace(/"/g, '');
                        const logUser = values[6].replace(/"/g, '');
                        
                        if (logDate === date && logEvent === eventName && 
                            logTown === eventTown && logUser === decoded.name) {
                            return res.status(400).json({ 
                                success: false, 
                                message: 'Attendance already logged for this event on this date' 
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // File doesn't exist yet, create header
            existingData = 'Timestamp,Date,Event_Name,Location,Town,People_Served,Outreach_Name,Notes\n';
            await fs.writeFile(csvPath, existingData, 'utf8');
        }
        
        // Create new log entry
        const timestamp = new Date().toISOString();
        const csvLine = [
            timestamp,
            date,
            `"${eventName.replace(/"/g, '""')}"`,
            `"${eventTown.replace(/"/g, '""')}"`,
            eventTown,
            peopleCount,
            `"${decoded.name.replace(/"/g, '""')}"`,
            `"${(notes || '').replace(/"/g, '""')}"`
        ].join(',');
        
        // Append to CSV file
        await fs.appendFile(csvPath, csvLine + '\n', 'utf8');
        
        // Log the successful entry
        console.log(`Attendance logged: ${eventName} - ${eventTown} on ${date} by ${decoded.name}`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Attendance logged successfully',
            data: {
                timestamp,
                date,
                eventName,
                location: eventTown,
                peopleServed: peopleCount,
                loggedBy: decoded.name
            }
        });
        
    } catch (error) {
        console.error('Attendance logging error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while logging attendance' 
        });
    }
};