# Homeless Aid UK - Outreach Attendance System

## Overview
This secure attendance logging system allows designated lead volunteers to log attendance data from street kitchens and outreach events. The system includes authentication, data logging, admin viewing, and export capabilities.

## System Components

### 1. Authentication System
- **Login Page**: `/Outreach/login.html`
- **JWT-based authentication** with 4-hour token expiration
- **Rate limiting**: 5 attempts per 15 minutes
- **Secure password handling**

### 2. Attendance Dashboard
- **Protected Dashboard**: `/Outreach/dashboard.html`
- **Features**:
  - Event selection from existing feed locations
  - Date selection (cannot log future dates)
  - People served count (0-500)
  - Optional notes field
  - Today/Week/Month statistics
  - Recent logs view

### 3. API Endpoints
- `/api/auth/login` - User authentication
- `/api/auth/verify` - Token verification
- `/api/auth/logout` - Logout endpoint
- `/api/attendance/log` - Log attendance (protected)
- `/api/attendance/list` - View logs (protected)
- `/api/attendance/stats` - Statistics (protected)

### 4. Admin Integration
- New "Attendance Data" tab in admin panel
- View all attendance logs
- Export data as CSV
- Statistics overview

## Setup Instructions

### 1. Environment Variables Setup (Vercel)

1. Go to your Vercel dashboard
2. Navigate to Settings → Environment Variables
3. Add the following variables:

```bash
# Lead Volunteer Credentials
OUTREACH_USERNAME_1=ben_bolton
OUTREACH_PASSWORD_1=[secure_password]
OUTREACH_NAME_1=Ben Ahern

# Add more volunteers as needed
OUTREACH_USERNAME_2=username2
OUTREACH_PASSWORD_2=[secure_password]
OUTREACH_NAME_2=Volunteer Name

# JWT Secret (generate a secure random string)
JWT_SECRET=[32+ character random string]
```

### 2. Generate Secure JWT Secret

```bash
# On Mac/Linux:
openssl rand -base64 32

# Or use an online generator for a 256-bit key
```

### 3. Deploy to Vercel

```bash
# Commit all changes
git add .
git commit -m "feat: Add Outreach attendance logging system"
git push origin main

# Vercel will auto-deploy
```

## Usage Guide

### For Lead Volunteers

1. **Access the System**
   - Navigate to: `https://homelessaid.co.uk/Outreach/login.html`
   - Enter your username and password
   - Click "Sign In"

2. **Log Attendance**
   - Select the event/location from dropdown
   - Date is auto-set to today (can change to past dates)
   - Enter number of people served
   - Add optional notes
   - Click "Submit Attendance"

3. **View Statistics**
   - Dashboard shows Today/Week/Month totals
   - Recent logs table shows last 10 entries

4. **Logout**
   - Click "Logout" button in header
   - Session expires after 4 hours automatically

### For Administrators

1. **Access Admin Panel**
   - Go to: `https://homelessaid.co.uk/admin.html`
   - Login with admin credentials
   - Click "Attendance Data" tab

2. **View Attendance Data**
   - Statistics cards show totals
   - Table displays all attendance logs
   - Data updates in real-time

3. **Export Data**
   - Click "Export CSV" button
   - File downloads with all attendance data
   - Format: Date, Event, Location, People Served, etc.

## Security Features

1. **Authentication**
   - JWT tokens with 4-hour expiration
   - Secure password storage (environment variables)
   - Rate limiting on login attempts

2. **Data Protection**
   - All API endpoints require authentication
   - Tokens verified on each request
   - Duplicate entry prevention

3. **Access Control**
   - Only authorized lead volunteers can log data
   - Admin panel shows read-only view
   - Export requires admin access

## Data Structure

### Attendance Log CSV Format
```csv
Timestamp,Date,Event_Name,Location,Town,People_Served,Outreach_Name,Notes
2024-01-15T10:30:00Z,2024-01-15,"Bolton Street Kitchen","Le Mans Crescent","Bolton",45,"Ben Ahern","Cold weather, high attendance"
```

## Troubleshooting

### Common Issues

1. **Login Failed**
   - Check username/password spelling
   - Ensure credentials are set in Vercel
   - Wait 15 minutes if locked out

2. **Cannot Submit Attendance**
   - Ensure all required fields are filled
   - Check date is not in future
   - Verify token hasn't expired (4 hours)

3. **Dashboard Not Loading**
   - Clear browser cache
   - Check internet connection
   - Try logging out and back in

### Error Messages

- **"Token has expired"** - Login again
- **"Invalid username or password"** - Check credentials
- **"Too many failed attempts"** - Wait 15 minutes
- **"Attendance already logged"** - Entry exists for that date/event

## Mobile Usage

The system is fully mobile-optimized:
- Touch-friendly interface
- Responsive design
- Works on all devices
- Optimized for field use

## Future Enhancements

Planned features for Phase 2:
- WhatsApp integration for notifications
- Photo upload capability
- Offline mode with sync
- Weather data integration
- Volunteer scheduling system

## Support

For technical issues or access requests:
- Email: info@homelessaid.co.uk
- Include: Name, location, issue description

## Testing the System

### Test Credentials (Development Only)
```
Username: test_volunteer
Password: Test123!@#
Name: Test Volunteer
```

### Test Flow
1. Login at `/Outreach/login.html`
2. Submit test attendance entry
3. View in dashboard
4. Check admin panel
5. Export CSV to verify data

## API Response Examples

### Successful Login
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGc...",
  "user": {
    "name": "Ben Ahern",
    "role": "lead_volunteer"
  }
}
```

### Attendance Submission
```json
{
  "success": true,
  "message": "Attendance logged successfully",
  "data": {
    "timestamp": "2024-01-15T10:30:00Z",
    "date": "2024-01-15",
    "eventName": "Bolton Street Kitchen",
    "location": "Bolton",
    "peopleServed": 45,
    "loggedBy": "Ben Ahern"
  }
}
```

## Maintenance

### Regular Tasks
- Review attendance logs weekly
- Export monthly reports
- Update volunteer credentials quarterly
- Check for unusual patterns

### Backup Procedures
- Export CSV weekly
- Store in secure location
- Maintain 3-month history minimum

---

**System Version**: 1.0.0  
**Last Updated**: January 2025  
**Developed for**: Homeless Aid UK CIC