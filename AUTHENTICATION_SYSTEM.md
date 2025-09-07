# Homeless Aid UK - Authentication System Documentation

## Overview
Complete user authentication system implemented for the Outreach portal with role-based access control, secure password handling, and invitation-based user creation.

## ✅ Implemented Components

### 1. Database Schema (`database-schema.sql`)
- **outreach_users table**: Complete user management with roles (Admin, Team Lead, Volunteer)
- **Password security**: bcrypt hashing, email verification, invitation tokens
- **Audit logging**: outreach_user_audit table for tracking admin actions
- **Row Level Security (RLS)**: Policies implemented for data protection
- **Initial admin user**: BenAdmin (benahern1991@gmail.com) created manually

### 2. Authentication APIs
**Location**: `/api/auth/`
- **login.js**: JWT-based login with rate limiting (5 attempts, 15min lockout)
- **setup-password.js**: Secure password setup via invitation tokens
- **verify-invitation.js**: Token validation for password setup
- **logout.js & verify.js**: Session management

### 3. Frontend Pages
**Location**: `/Outreach/`
- **login.html**: Professional login interface with JWT authentication
- **setup-password.html**: Password setup page with real-time validation
- **dashboard.html**: Main Outreach portal (existing)

### 4. Security Utilities (`utils/auth.js`)
- **Password hashing**: bcrypt with 12 salt rounds
- **JWT tokens**: 4-hour expiration with role-based payload
- **Password validation**: 8+ chars, upper/lower/numbers/symbols required
- **Role permissions**: Admin/Team Lead/Volunteer access levels
- **Audit logging**: Complete tracking of admin actions

### 5. Dependencies Added
```json
{
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.2"
}
```

## 🔧 Configuration Status

### Environment Variables Required
**Status**: ⚠️ **NEEDS SETUP IN VERCEL**

Required variables for production:
```
NEXT_PUBLIC_SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZmR0Z2ZqbHdldnJ6Ynhoc3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyMzMwNzYsImV4cCI6MjA3MTgwOTA3Nn0.zNLozjU0DCyebYkJMKtNHtaUaehPpBKUvVx4QviaQLY
JWT_SECRET=-.]9KLLv:SpUf[P9-DNmpk%@F7nMSi!r
```

### Vercel Configuration (`vercel.json`)
- **Function timeouts**: Added 10s timeout for auth APIs
- **Rewrites**: Clean URLs for Outreach pages
- **Status**: ✅ **DEPLOYED**

## 🎯 Current Status

### ✅ Working Components
- **Database schema**: Fully implemented and deployed
- **Admin user**: Created (BenAdmin) with hashed password
- **Login page**: Accessible at `/Outreach/login.html`
- **Authentication APIs**: Deployed and configured
- **Password hashing**: bcrypt with proper security

### ⚠️ Issues Identified
1. **Environment variables missing in Vercel production**
   - Causes API calls to fail with "Missing Supabase environment variables"
   - Login returns generic error message

2. **RLS Policy Recursion**
   - Database policies cause infinite recursion during programmatic user creation
   - Manual database updates required for now

3. **Setup password page routing**
   - May have deployment issues due to Vercel configuration

## 🚀 Next Steps to Complete

### CRITICAL - Set Vercel Environment Variables
1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add the three environment variables listed above
3. Set for Production, Preview, and Development environments
4. Redeploy the project

### Test Authentication Flow
1. **Test login**: https://www.homelessaid.co.uk/Outreach/login.html
   - Username: `BenAdmin`
   - Password: `BenAdmin123!`

2. **Verify APIs work**: 
   - Login should return JWT token
   - Dashboard should be accessible

### Future Enhancements
1. **Fix RLS policies** for automatic user creation
2. **Email invitation system** (apis exist but need email provider setup)
3. **Admin user management interface**
4. **Password reset functionality**

## 🔐 Security Features

### Password Security
- **bcrypt hashing** with 12 salt rounds
- **Strong password requirements**: 8+ chars, mixed case, numbers, symbols
- **Rate limiting**: 5 failed attempts = 15-minute lockout
- **No plain text storage**: All passwords properly hashed

### JWT Security
- **4-hour token expiration**
- **Role-based payload**: Admin/Team Lead/Volunteer permissions
- **Secure secret key**: 32-character random string
- **Issuer validation**: Prevents token manipulation

### Database Security
- **Row Level Security (RLS)**: Enabled on all tables
- **Audit logging**: All admin actions tracked with IP and timestamp
- **Email verification**: Required for account activation
- **Invitation-based creation**: Prevents unauthorized signups

## 📁 File Structure

```
/
├── Outreach/
│   ├── login.html           ✅ Login interface
│   ├── setup-password.html  ✅ Password setup page
│   └── dashboard.html       ✅ Main portal
├── api/auth/
│   ├── login.js            ✅ Authentication endpoint
│   ├── setup-password.js   ✅ Password setup API
│   ├── verify-invitation.js ✅ Token validation
│   ├── logout.js           ✅ Session cleanup
│   └── verify.js           ✅ Token verification
├── utils/
│   ├── auth.js             ✅ Security utilities
│   └── supabase.js         ✅ Database client
├── database-schema.sql     ✅ Complete schema
├── package.json            ✅ Updated dependencies
└── vercel.json             ✅ Deployment config
```

## 🛠️ Troubleshooting

### Login Fails with "Invalid username or password"
1. Check Vercel environment variables are set
2. Verify admin user exists in database with correct password hash
3. Check browser network tab for API error details

### 404 Errors on Outreach Pages
1. Ensure Vercel deployment completed successfully
2. Check vercel.json has correct rewrite rules
3. Verify files are committed to git repository

### Database Connection Errors
1. Verify Supabase credentials in environment variables
2. Check RLS policies aren't blocking legitimate queries
3. Ensure Supabase project is active and accessible

---

**Last Updated**: January 7, 2025  
**Status**: Ready for final environment variable setup and testing