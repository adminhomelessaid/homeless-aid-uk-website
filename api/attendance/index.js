const jwt = require('jsonwebtoken');
const { createSupabaseClient } = require('../../utils/supabase');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
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
        const jwtSecret = process.env.JWT_SECRET || 'temporary-secret-key';
        
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
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
        
        const url = new URL(req.url, `http://${req.headers.host}`);
        const action = url.searchParams.get('action') || 'list';
        
        // Route to appropriate handler based on method and action parameter
        if (req.method === 'POST') {
            return await handleLogAttendance(req, res, decoded);
        } else if (req.method === 'GET') {
            if (action === 'stats') {
                return await handleGetStats(req, res);
            } else {
                return await handleListAttendance(req, res);
            }
        } else {
            return res.status(405).json({ 
                success: false, 
                message: 'Method not allowed' 
            });
        }
        
    } catch (error) {
        console.error('Attendance API error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while processing attendance request' 
        });
    }
};

// Handle logging attendance (POST)
async function handleLogAttendance(req, res, decoded) {
    try {
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
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Calculate day of week from the date
        const eventDate = new Date(date);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[eventDate.getDay()];
        
        // Create a smart event name format based on the data patterns
        let formattedEventName;
        
        // Clean up the event name for better formatting
        const cleanEventName = eventName.trim();
        const cleanTownName = eventTown.trim();
        
        if (cleanEventName.toLowerCase() === cleanTownName.toLowerCase()) {
            // For cases like "Oldham", "Bury", "Manchester" etc. - these are location-based events
            formattedEventName = `${cleanTownName} Street Kitchen`;
        } else if (cleanEventName.toLowerCase().includes('street kitchen')) {
            // Already has "Street Kitchen" in the name
            formattedEventName = cleanEventName;
        } else if (cleanEventName.toLowerCase().includes(cleanTownName.toLowerCase())) {
            // Town name is already in the event name (e.g., "Manchester City Centre")
            formattedEventName = cleanEventName;
        } else {
            // For specific venues like "Grillsters", "Rice n Three", etc.
            formattedEventName = `${cleanTownName} - ${cleanEventName}`;
        }
        
        // Insert attendance log into database
        const { data: logEntry, error } = await supabase
            .from('attendance_logs')
            .insert([
                {
                    event_date: date,
                    event_name: formattedEventName,
                    event_location: eventTown,
                    event_town: eventTown,
                    event_day: dayOfWeek,
                    people_served: peopleCount,
                    outreach_name: decoded.name,
                    notes: notes || ''
                }
            ])
            .select()
            .single();
        
        if (error) {
            // Check if it's a duplicate entry error
            if (error.code === '23505') { // PostgreSQL unique violation
                return res.status(400).json({
                    success: false,
                    message: 'Attendance already logged for this event on this date by this volunteer'
                });
            }
            
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to save attendance log to database'
            });
        }
        
        // Log the successful entry
        console.log(`Attendance logged: ${eventName} - ${eventTown} on ${date} by ${decoded.name} - People served: ${peopleCount} - ID: ${logEntry.id}`);
        
        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Attendance logged successfully',
            data: {
                id: logEntry.id,
                timestamp: logEntry.created_at,
                date: logEntry.event_date,
                day: logEntry.event_day,
                eventName: logEntry.event_name,
                location: logEntry.event_location,
                town: logEntry.event_town,
                peopleServed: logEntry.people_served,
                outreachName: logEntry.outreach_name,
                notes: logEntry.notes
            }
        });
        
    } catch (error) {
        console.error('Log attendance error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while logging attendance' 
        });
    }
}

// Handle listing attendance (GET)
async function handleListAttendance(req, res) {
    try {
        // Parse query parameters
        const url = new URL(req.url, `http://${req.headers.host}`);
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const location = url.searchParams.get('location');
        
        // Initialize Supabase client
        const supabase = createSupabaseClient();
        
        // Build query
        let query = supabase
            .from('attendance_logs')
            .select(`
                id,
                created_at,
                event_date,
                event_day,
                event_name,
                event_location,
                event_town,
                people_served,
                outreach_name,
                notes
            `)
            .order('created_at', { ascending: false });
        
        // Apply date filters
        if (startDate) {
            query = query.gte('event_date', startDate);
        }
        if (endDate) {
            query = query.lte('event_date', endDate);
        }
        
        // Apply location filter
        if (location) {
            query = query.ilike('event_town', `%${location}%`);
        }
        
        // Apply pagination
        query = query.range(offset, offset + limit - 1);
        
        // Execute query
        const { data: logs, error, count } = await query;
        
        if (error) {
            console.error('Database query error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch attendance logs from database'
            });
        }
        
        // Get total count for pagination
        const { count: totalCount, error: countError } = await supabase
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true });
        
        const totalLogs = countError ? 0 : totalCount;
        
        // Transform data to match expected format
        const transformedLogs = logs.map(log => ({
            id: log.id,
            timestamp: log.created_at,
            date: log.event_date,
            day: log.event_day,
            eventName: log.event_name,
            location: log.event_location,
            town: log.event_town,
            peopleServed: log.people_served,
            outreachName: log.outreach_name,
            notes: log.notes
        }));
        
        // Return response
        return res.status(200).json({
            success: true,
            logs: transformedLogs,
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
}

// Handle getting statistics (GET with ?action=stats)
async function handleGetStats(req, res) {
    try {
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
}