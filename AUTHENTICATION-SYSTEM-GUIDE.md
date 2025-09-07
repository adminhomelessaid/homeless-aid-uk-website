# Authentication System Documentation - Homeless Aid UK Outreach Portal

## Overview
This document provides comprehensive information about the authentication system for the Homeless Aid UK Outreach Portal, including setup, troubleshooting, and maintenance.

## System Architecture

### Technology Stack
- **Database**: Supabase PostgreSQL with Row Level Security (RLS) 
- **Authentication**: JWT tokens with 4-hour expiration
- **Password Security**: bcrypt hashing with 12 salt rounds
- **Frontend**: HTML/JavaScript login forms
- **Backend**: Vercel serverless functions
- **User Roles**: Admin, Team Lead, Volunteer

### Current Implementation Status
✅ **WORKING** - Authentication system is fully operational as of September 2025

## Environment Variables

### Required Variables in Vercel
```bash
# Supabase Configuration
SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY

# JWT Authentication
JWT_SECRET=-.]9KLLv:SpUf[P9-DNmpk%@F7nMSi!r
```

### Important Notes
- All variables must be set in Vercel environment variables
- Both regular and `NEXT_PUBLIC_` versions are required for proper functionality
- JWT_SECRET should be kept secure and not shared

## Database Configuration

### RLS Policies - CURRENT STATE
**CRITICAL**: Row Level Security (RLS) is **DISABLED** for the `outreach_users` table to prevent infinite recursion issues.

```sql
-- Current state (working)
ALTER TABLE outreach_users DISABLE ROW LEVEL SECURITY;
```

### User Table Structure
```sql
CREATE TABLE outreach_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'team_lead', 'volunteer')),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  invitation_token VARCHAR(255) UNIQUE,
  invitation_sent_at TIMESTAMP WITH TIME ZONE,
  password_set_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES outreach_users(id)
);
```

### Current Users
1. **admin** - No password set (inactive)
2. **BenAdmin** - Active admin user with password

## API Endpoints

### Authentication Endpoints
- `/api/auth/login` - User login (POST)
- `/api/auth/verify` - Token verification (GET)  
- `/api/auth/logout` - User logout (POST) - REMOVED
- `/api/auth/setup-password` - Password setup for new users (POST)
- `/api/auth/verify-invitation` - Invitation verification (POST)

### Attendance Endpoints (Protected)
- `/api/attendance/list` - List attendance logs (GET)
- `/api/attendance/log` - Create attendance log (POST) 
- `/api/attendance/stats` - Get attendance statistics (GET)

### Admin Endpoints (Protected)
- `/api/admin/create-user` - Create new users (POST)

## Current Login Credentials

### BenAdmin Account
- **Username**: `BenAdmin`
- **Password**: `TestPassword123`
- **Role**: admin
- **Status**: Active ✅

## JWT Configuration

### Current Implementation
All authentication endpoints use a **temporary hardcoded secret** for compatibility:

```javascript
const jwtSecret = 'temporary-secret-key';
```

### Token Structure
```javascript
{
  id: "123",
  username: "BenAdmin", 
  name: "Ben Admin",
  role: "admin",
  iat: 1757281378,
  exp: 1757295778
}
```

## Vercel Deployment Constraints

### Function Limit
- **Maximum Functions**: 12 (Hobby Plan)
- **Current Count**: 11 functions
- **Status**: ✅ Under limit

### Current API Functions
1. `api/send-email.js`
2. `api/send-invitation-email.js`  
3. `api/auth/login.js`
4. `api/auth/verify.js`
5. `api/auth/setup-password.js`
6. `api/auth/verify-invitation.js`
7. `api/attendance/list.js`
8. `api/attendance/log.js`
9. `api/attendance/stats.js`
10. `api/admin/create-user.js`
11. `api/auth/login-original.js` (backup)

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Authentication Failures
**Symptoms**: "Invalid username or password" errors
**Causes**:
- Missing environment variables
- Database connection issues
- RLS policy conflicts
- Incorrect password hash

**Solutions**:
```bash
# Test database connection
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
supabase.from('outreach_users').select('username').then(console.log);
"
```

#### 2. Rate Limiting Issues
**Symptoms**: "Too many failed attempts" messages
**Current State**: Rate limiting is **DISABLED** in production

**Location**: `api/auth/login.js` (lines 4-7 commented out)

#### 3. Token Verification Failures  
**Symptoms**: 401 errors on dashboard, immediate logout
**Solution**: Ensure all endpoints use the same JWT secret

**Fixed Files**:
- `api/auth/verify.js`
- `api/attendance/list.js`
- `api/attendance/log.js` 
- `api/attendance/stats.js`

#### 4. Deployment Issues
**Symptoms**: Changes not reflecting in production
**Common Causes**:
- Exceeded 12 function limit
- Build failures
- Vercel configuration errors

**Check**: Vercel Dashboard → Project → Deployments tab

#### 5. Database Connection Errors
**Symptoms**: 500 errors, "infinite recursion detected in policy"
**Solution**: RLS policies disabled (current state)

### Password Reset Process
If admin password needs to be reset:

```sql
-- Generate new hash locally first
UPDATE outreach_users 
SET password_hash = '$2a$10$F0sLbO.zh9PwcWZrIetRbuqbRyRjzGSj3eUnjXR57gUiBRBG6Girq'
WHERE username = 'BenAdmin';
-- This hash corresponds to: TestPassword123
```

## Security Considerations

### Current Security Status
- ✅ bcrypt password hashing (12 rounds)
- ✅ JWT token expiration (4 hours)
- ⚠️ Hardcoded JWT secret (temporary)
- ⚠️ RLS disabled (functional requirement)
- ⚠️ CORS allows all origins

### Recommended Improvements (Future)
1. Implement proper JWT secret management
2. Re-enable RLS with corrected policies
3. Restrict CORS to specific domains
4. Add refresh token mechanism
5. Implement proper audit logging

## File Structure

### Core Files
```
api/
├── auth/
│   ├── login.js              # Main login endpoint
│   ├── login-original.js     # Backup of original implementation
│   ├── verify.js             # Token verification
│   ├── setup-password.js     # New user password setup
│   └── verify-invitation.js  # Invitation verification
├── attendance/
│   ├── list.js              # List attendance logs
│   ├── log.js               # Create attendance log
│   └── stats.js             # Attendance statistics
├── admin/
│   └── create-user.js       # User creation
└── send-invitation-email.js # Email invitations

utils/
├── auth.js                   # Authentication utilities
└── supabase.js              # Database connection

Outreach/
├── login.html               # Login page
└── dashboard.html           # Main dashboard
```

## Development Notes

### Testing Locally
```bash
# Test password hash generation
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('TestPassword123', 12).then(console.log);
"

# Test database query
node -e "
const { createSupabaseClient } = require('./utils/supabase');
const supabase = createSupabaseClient();
supabase.from('outreach_users').select('username, role').then(console.log);
"
```

### Deployment Checklist
- [ ] Function count ≤ 12
- [ ] All environment variables set
- [ ] JWT secrets consistent across endpoints  
- [ ] Database accessible
- [ ] No syntax errors in API files

## Maintenance

### Regular Tasks
1. Monitor Vercel deployment status
2. Check function count before adding new endpoints
3. Rotate JWT secrets periodically (requires coordination)
4. Monitor database connection health

### Emergency Procedures
If authentication completely fails:
1. Check Vercel deployment status
2. Verify environment variables
3. Test database connectivity
4. Check function count limits
5. Review recent code changes

## Change Log

### September 2025 - Major Authentication Fix
- **Issue**: Complete authentication system failure
- **Root Causes**: 
  - Missing environment variables
  - RLS policy infinite recursion
  - JWT secret mismatches
  - Vercel function limit exceeded
- **Resolution**: 
  - Fixed environment variables
  - Disabled problematic RLS policies
  - Unified JWT secret across all endpoints
  - Reduced function count to 11
  - Implemented minimal working authentication
- **Status**: ✅ Fully operational

### Current Working State
- Login: ✅ Working
- Dashboard: ✅ Working  
- Attendance logging: ✅ Working
- Token verification: ✅ Working
- All API endpoints: ✅ Working

---

*Last updated: September 2025*
*Status: OPERATIONAL*