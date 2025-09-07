# Supabase Database Setup Guide

## 1. Execute Database Schema

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to your project: `homeless-aid-uk-attendance`
3. Click on "SQL Editor" in the left sidebar
4. Copy and paste the entire contents of `database/attendance_logs.sql`
5. Click "Run" to execute the SQL

This will create:
- ✅ `attendance_logs` table with proper structure
- ✅ Indexes for fast queries
- ✅ Row Level Security policies
- ✅ Export view for CSV functionality
- ✅ Sample test data

## 2. Add Environment Variables to Vercel

1. Go to your Vercel dashboard
2. Navigate to your project → Settings → Environment Variables
3. Add these new variables:

```
SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY
```

## 3. Verify Database Connection

After deployment, test the database connection by visiting:
`https://homelessaid.co.uk/api/attendance/stats`

You should see:
```json
{
  "success": true,
  "today": 0,
  "week": 15,
  "month": 15,
  "allTime": 15,
  "topLocations": [...],
  "topVolunteers": [...]
}
```

## 4. Database Features Now Available

### ✅ Persistent Data Storage
- All attendance logs permanently stored
- Proper PostgreSQL database with ACID compliance
- Automatic backups and point-in-time recovery

### ✅ Real-time Statistics  
- Dashboard shows actual numbers from database
- Today/Week/Month/All-time totals
- Top locations and volunteers analytics

### ✅ Advanced Filtering
- Filter logs by date range
- Filter by location/town
- Pagination for large datasets

### ✅ Duplicate Prevention
- Database constraints prevent duplicate entries
- Clear error messages for duplicate attempts
- Unique constraint on (date, event, town, volunteer)

### ✅ CSV Export
- Full historical data export
- All fields included in proper CSV format
- Admin panel export button functional

### ✅ Audit Trail
- Complete record of who logged what and when
- Immutable log entries with timestamps
- Full accountability for all entries

## 5. Database Schema Details

### Table: `attendance_logs`
```sql
- id: UUID (Primary Key)
- created_at: Timestamp (Auto-generated)
- event_date: Date (Event date)
- event_name: Text (Event name from feed-times.csv)  
- event_location: Text (Location name)
- event_town: Text (Town/City)
- people_served: Integer (0-500, validated)
- outreach_name: Text (Volunteer name)
- notes: Text (Optional notes)
```

### Indexes for Performance
- Date-based queries (most common)
- Location-based filtering
- Volunteer-based queries
- Combined date+location queries

### Row Level Security
- Anonymous users can read and insert (API key auth)
- Proper policies for volunteer access
- Secure by default configuration

## 6. What Changes for Users

### For Volunteers (Dashboard):
- ✅ Same login process
- ✅ Same attendance logging form
- ✅ Now shows REAL statistics
- ✅ Recent logs now display actual data
- ✅ Duplicate prevention with clear messages

### For Admins (Admin Panel):
- ✅ Attendance Data tab shows real data
- ✅ Export CSV button downloads full history
- ✅ Statistics show actual numbers
- ✅ Filter and search functionality

### For System:
- ✅ All data persisted between deployments
- ✅ Fast query performance with proper indexing
- ✅ Scalable to thousands of log entries
- ✅ Ready for future WhatsApp integration
- ✅ Real-time data synchronization

## 7. Troubleshooting

### Common Issues:

**Database Connection Error**
- Verify environment variables are set correctly in Vercel
- Check Supabase project is active (not paused)
- Confirm SQL schema was executed successfully

**Attendance Submission Fails**
- Check Vercel function logs for detailed error
- Verify table exists and has correct schema
- Confirm RLS policies are properly configured

**Stats Show Zero**
- Verify sample data was inserted during schema setup
- Check if attendance logs exist in Supabase dashboard
- Confirm API is connecting to correct database

### Verification Steps:

1. **Check Supabase Dashboard**:
   - Go to Table Editor → `attendance_logs`
   - Verify table exists and has sample data

2. **Test API Endpoints**:
   - `/api/attendance/stats` - Should show numbers
   - `/api/attendance/list` - Should show log entries

3. **Check Vercel Function Logs**:
   - Look for database connection messages
   - Check for any error messages
   - Verify successful log insertions

## 8. Next Steps

After database is working:
- All features fully functional
- Ready for production use
- Consider adding more volunteers
- Plan Phase 3: WhatsApp integration
- Monitor usage and performance

The system now has enterprise-grade data persistence with full audit trails and real-time analytics!