const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

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
        
        // Read CSV file
        const csvPath = path.join(process.cwd(), 'attendance-logs.csv');
        let logs = [];
        
        try {
            const csvData = await fs.readFile(csvPath, 'utf8');
            const lines = csvData.split('\n');
            
            // Skip header and process data
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
                    
                    if (values && values.length >= 8) {
                        const log = {
                            timestamp: values[0].replace(/"/g, ''),
                            date: values[1].replace(/"/g, ''),
                            eventName: values[2].replace(/"/g, ''),
                            location: values[3].replace(/"/g, ''),
                            town: values[4].replace(/"/g, ''),
                            peopleServed: parseInt(values[5]),
                            outreachName: values[6].replace(/"/g, ''),
                            notes: values[7] ? values[7].replace(/"/g, '') : ''
                        };
                        
                        // Apply filters
                        let include = true;
                        
                        if (startDate && log.date < startDate) include = false;
                        if (endDate && log.date > endDate) include = false;
                        if (location && !log.town.toLowerCase().includes(location.toLowerCase())) include = false;
                        
                        if (include) {
                            logs.push(log);
                        }
                    }
                }
            }
        } catch (error) {
            // File doesn't exist yet
            console.log('No attendance logs file found');
        }
        
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