const jwt = require('jsonwebtoken');
const { createSupabaseClient } = require('../../utils/supabase');

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
        const jwtSecret = 'temporary-secret-key';
        
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
        
        // Log the successful entry (this will appear in Vercel function logs)
        console.log(`Attendance logged to database: ${eventName} - ${eventTown} on ${date} by ${decoded.name} - People served: ${peopleCount} - ID: ${logEntry.id}`);
        
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
        console.error('Attendance logging error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'An error occurred while logging attendance' 
        });
    }
};