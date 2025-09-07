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
            eventName: log.event_name,
            location: log.event_location,
            town: log.event_town,
            peopleServed: log.people_served,
            outreachName: log.outreach_name,
            notes: log.notes
        }));
        
        const paginatedLogs = transformedLogs;
        
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