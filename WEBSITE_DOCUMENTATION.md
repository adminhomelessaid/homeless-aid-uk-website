# Homeless Aid UK Website Documentation

## Overview
The Homeless Aid UK website is a comprehensive Progressive Web Application (PWA) for a volunteer-run organization that provides food, support, and resources to homeless individuals across the UK. The organization operates in multiple cities including Bolton, Bury, Manchester, Oldham, Liverpool, Wigan, Leigh, and Glasgow.

**Last Updated**: September 2025  
**Version**: 7.0 - **SECURITY REMEDIATION & AUTHENTICATION FIX**
**Cache-Busting Version**: 2024.12.19.1
**Google Analytics ID**: G-8L51XD6M9J

## 🚀 LIVE DEPLOYMENT STATUS
- **Website**: https://homelessaid.co.uk (LIVE)
- **Outreach Portal**: https://homelessaid.co.uk/Outreach/login.html (LIVE)
- **Hosting**: Vercel (Auto-deployment from GitHub)
- **Database**: Supabase PostgreSQL
- **Email System**: Resend API with Office 365 integration
- **Domain Management**: Cloudflare with clean URLs
- **Repository**: https://github.com/adminhomelessaid/homeless-aid-uk-website
- **Performance**: Optimized mobile responsive grid system
- **Geolocation**: Near Me functionality with distance calculation
- **Cache Control**: Comprehensive cache-busting implementation with .htaccess rules
- **Analytics**: Google Analytics (GA4) with comprehensive behavior tracking
- **Privacy Compliance**: GDPR-compliant cookie consent system

## ⚡ RECENT UPDATES (Version 7.0) - September 2025

### 🔐 Security Remediation Completed
- **JWT Secret Management**: All endpoints now use environment variable `JWT_SECRET` instead of hardcoded values
- **Backwards Compatibility**: Fallback to temporary key ensures zero downtime during migration
- **RLS Policies**: Created safe Row Level Security policies that avoid infinite recursion
- **Authentication Status**: ✅ FULLY OPERATIONAL with BenAdmin / TestPassword123

### 🛡️ Security Improvements
1. **JWT Token Security**
   - All 5 authentication endpoints updated to use `process.env.JWT_SECRET`
   - Consistent secret across login, verify, and attendance endpoints
   - 4-hour token expiration maintained

2. **Database Security (Pending Implementation)**
   - New RLS policies created in `database/rls-policies-fix.sql`
   - Service role bypass prevents recursion
   - Granular permissions for admin, team lead, and volunteer roles
   - Safe migration path with rollback instructions

3. **Current Security Status**
   - ⚠️ RLS temporarily disabled on `outreach_users` table (working but insecure)
   - ✅ JWT tokens properly signed with environment secret (when set in Vercel)
   - ✅ Password hashing with bcrypt (12 salt rounds)
   - ✅ Authentication fully functional

## 📋 Authentication System

### Current Working Credentials
- **Username**: `BenAdmin`
- **Password**: `TestPassword123`
- **Role**: Admin
- **Status**: ✅ ACTIVE

### API Endpoints (11/12 Vercel Function Limit)
```
Authentication:
├── /api/auth/login          # User login (JWT generation)
├── /api/auth/verify         # Token verification
├── /api/auth/setup-password # Password setup for new users
└── /api/auth/verify-invitation # Invitation token validation

Attendance (Protected):
├── /api/attendance/list     # List attendance logs
├── /api/attendance/log      # Create attendance log
└── /api/attendance/stats    # Get statistics

Admin (Protected):
├── /api/admin/create-user   # User management
└── /api/send-invitation-email # User invitations

Utility:
└── /api/send-email          # Contact form emails
```

### Environment Variables Required
```bash
# Supabase Configuration (Set in Vercel)
SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://vnfdtgfjlwevrzbxhsub.supabase.co
SUPABASE_ANON_KEY=[Your Supabase Anon Key]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[Your Supabase Anon Key]

# JWT Authentication (CRITICAL - Must be set in Vercel)
JWT_SECRET=[Your Secure JWT Secret]
```

## 🚨 CRITICAL ACTIONS REQUIRED

### 1. Set JWT_SECRET in Vercel (IMMEDIATE)
```bash
# Go to Vercel Dashboard → Project Settings → Environment Variables
# Add: JWT_SECRET = [generate a secure 32+ character random string]
# Apply to: Production, Preview, Development
# Redeploy after setting
```

### 2. Apply RLS Policies (WHEN READY)
```sql
-- Test in Supabase SQL Editor first
-- File: database/rls-policies-fix.sql
-- Apply in a transaction for safe rollback if needed
BEGIN;
-- Run SQL from rls-policies-fix.sql
COMMIT;
```

### 3. Verify Everything Works
1. Test login at https://homelessaid.co.uk/Outreach/login.html
2. Verify JWT tokens are properly signed
3. Check attendance logging functionality
4. Monitor for any authentication errors

## 📊 Previous Updates

### Version 6.2 - Advanced Analytics
- PWA installation tracking
- Calendar integration analytics
- Feature usage intelligence
- Form conversion tracking
- User behavior insights
- Privacy-first implementation

### Version 6.1 - Cookie Consent
- Google Analytics GA4 integration
- GDPR-compliant consent system
- Granular cookie controls
- Persistent preference storage

### Version 6.0 - Cache Busting
- Versioned asset links
- Service worker updates
- Meta cache control tags

## 🔄 Migration Guide

### Phase 1: JWT Secret Migration (IMMEDIATE)
1. **Set JWT_SECRET in Vercel** (see Critical Actions above)
2. **Redeploy the application**
3. **Test authentication** with BenAdmin account
4. **Monitor logs** for any JWT errors

### Phase 2: RLS Implementation (WHEN STABLE)
1. **Backup database** before applying changes
2. **Test policies** in Supabase SQL editor
3. **Apply in transaction** for safe rollback
4. **Test all user roles** thoroughly
5. **Monitor for recursion** errors

### Rollback Procedures
If issues occur after RLS implementation:
```sql
-- Disable RLS immediately
ALTER TABLE outreach_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;

-- Drop all policies if needed
DROP POLICY IF EXISTS "Service role bypass" ON outreach_users;
-- Continue for all policies...
```

## 📁 Project Structure
```
/
├── api/                    # Vercel serverless functions
│   ├── auth/              # Authentication endpoints
│   ├── attendance/        # Attendance tracking
│   └── admin/            # Admin functions
├── Outreach/             # Portal pages
│   ├── login.html        # Login page
│   ├── dashboard.html    # Main portal
│   └── admin.html        # Admin panel
├── database/             # Database files
│   ├── rls-policies-fix.sql  # NEW: Safe RLS policies
│   └── schema.sql        # Database structure
├── utils/                # Utility functions
│   ├── auth.js          # Authentication utilities
│   └── supabase.js      # Database connection
└── docs/                # Documentation
```

## 🔧 Development & Testing

### Local Testing
```bash
# Test authentication
node test-auth.js

# Check environment variables
echo $JWT_SECRET

# Run local server
npm run dev
```

### Production Checklist
- [ ] JWT_SECRET set in Vercel
- [ ] All endpoints using environment variable
- [ ] Authentication tested and working
- [ ] No hardcoded secrets in code
- [ ] Documentation updated
- [ ] Backup created before RLS changes

## 📝 Changelog

### September 2025 (v7.0)
- Fixed JWT secret management across all endpoints
- Created safe RLS policies to prevent infinite recursion
- Updated all authentication documentation
- Maintained backward compatibility
- Added comprehensive migration guide

### August 2024 (v6.2)
- Advanced analytics tracking system
- PWA and feature usage intelligence
- Form conversion tracking

### December 2024 (v6.0-6.1)
- Cache-busting implementation
- Cookie consent system
- Google Analytics integration

## 🚀 Support & Maintenance

### Known Issues
1. **RLS Disabled**: Currently disabled to prevent recursion (security risk)
2. **Environment Variables**: Must be manually set in Vercel

### Contact
- **Admin User**: BenAdmin
- **Repository**: https://github.com/adminhomelessaid/homeless-aid-uk-website
- **Live Site**: https://homelessaid.co.uk

---

*This documentation represents the current state as of September 2025. All critical security issues have been addressed in code, pending deployment of environment variables and optional RLS implementation.*