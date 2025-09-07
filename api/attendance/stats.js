const jwt = require('jsonwebtoken');
const { createSupabaseClient } = require('../../utils/supabase');

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
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Get today's total
        const { data: todayData, error: todayError } = await supabase
            .from('attendance_logs')
            .select('people_served')
            .eq('event_date', today);
            
        todayTotal = todayError || !todayData ? 0 : 
            todayData.reduce((sum, log) => sum + (log.people_served || 0), 0);
        
        // Get this week's total
        const { data: weekData, error: weekError } = await supabase
            .from('attendance_logs')
            .select('people_served')
            .gte('event_date', weekStartStr);
            
        weekTotal = weekError || !weekData ? 0 : 
            weekData.reduce((sum, log) => sum + (log.people_served || 0), 0);
        
        // Get this month's total
        const { data: monthData, error: monthError } = await supabase
            .from('attendance_logs')
            .select('people_served')
            .gte('event_date', monthStartStr);
            
        monthTotal = monthError || !monthData ? 0 : 
            monthData.reduce((sum, log) => sum + (log.people_served || 0), 0);
        
        // Get all-time total
        const { data: allData, error: allError } = await supabase
            .from('attendance_logs')
            .select('people_served');
            
        allTimeTotal = allError || !allData ? 0 : 
            allData.reduce((sum, log) => sum + (log.people_served || 0), 0);
        
        // Get top locations
        const { data: locationData, error: locationError } = await supabase
            .from('attendance_logs')
            .select('event_town, people_served');
            
        locationStats = {};
        if (!locationError && locationData) {
            locationData.forEach(log => {
                const town = log.event_town;
                if (!locationStats[town]) {
                    locationStats[town] = 0;
                }
                locationStats[town] += log.people_served || 0;
            });
        }
        
        // Get top volunteers
        const { data: volunteerData, error: volunteerError } = await supabase
            .from('attendance_logs')
            .select('outreach_name, people_served');
            
        topVolunteers = {};
        if (!volunteerError && volunteerData) {
            volunteerData.forEach(log => {
                const name = log.outreach_name;
                if (!topVolunteers[name]) {
                    topVolunteers[name] = {
                        name: name,
                        logs: 0,
                        totalServed: 0
                    };
                }
                topVolunteers[name].logs++;
                topVolunteers[name].totalServed += log.people_served || 0;
            });
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