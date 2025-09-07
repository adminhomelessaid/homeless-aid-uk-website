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
        
        // Get current date info
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        // Calculate week start (Monday)
        const weekStart = new Date(now);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        const weekStartStr = weekStart.toISOString().split('T')[0];
        
        // Calculate month start
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStartStr = monthStart.toISOString().split('T')[0];
        
        // Initialize statistics
        let todayTotal = 0;
        let weekTotal = 0;
        let monthTotal = 0;
        let allTimeTotal = 0;
        let locationStats = {};
        let topVolunteers = {};
        
        // Read CSV file
        const csvPath = path.join(process.cwd(), 'attendance-logs.csv');
        
        try {
            const csvData = await fs.readFile(csvPath, 'utf8');
            const lines = csvData.split('\n');
            
            // Skip header and process data
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const values = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
                    
                    if (values && values.length >= 7) {
                        const logDate = values[1].replace(/"/g, '');
                        const location = values[4].replace(/"/g, '');
                        const peopleServed = parseInt(values[5]);
                        const volunteer = values[6].replace(/"/g, '');
                        
                        if (!isNaN(peopleServed)) {
                            // All time total
                            allTimeTotal += peopleServed;
                            
                            // Today's total
                            if (logDate === today) {
                                todayTotal += peopleServed;
                            }
                            
                            // This week's total
                            if (logDate >= weekStartStr) {
                                weekTotal += peopleServed;
                            }
                            
                            // This month's total
                            if (logDate >= monthStartStr) {
                                monthTotal += peopleServed;
                            }
                            
                            // Location statistics
                            if (!locationStats[location]) {
                                locationStats[location] = 0;
                            }
                            locationStats[location] += peopleServed;
                            
                            // Top volunteers (by number of logs)
                            if (!topVolunteers[volunteer]) {
                                topVolunteers[volunteer] = {
                                    name: volunteer,
                                    logs: 0,
                                    totalServed: 0
                                };
                            }
                            topVolunteers[volunteer].logs++;
                            topVolunteers[volunteer].totalServed += peopleServed;
                        }
                    }
                }
            }
        } catch (error) {
            // File doesn't exist yet
            console.log('No attendance logs file found');
        }
        
        // Sort locations by total served
        const sortedLocations = Object.entries(locationStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([location, total]) => ({ location, total }));
        
        // Sort volunteers by logs count
        const sortedVolunteers = Object.values(topVolunteers)
            .sort((a, b) => b.logs - a.logs)
            .slice(0, 5);
        
        // Return statistics
        return res.status(200).json({
            success: true,
            today: todayTotal,
            week: weekTotal,
            month: monthTotal,
            allTime: allTimeTotal,
            topLocations: sortedLocations,
            topVolunteers: sortedVolunteers,
            period: {
                today: today,
                weekStart: weekStartStr,
                monthStart: monthStartStr
            }
        });
        
    } catch (error) {
        console.error('Stats error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while fetching statistics' 
        });
    }
};