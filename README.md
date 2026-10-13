# Homeless Aid UK Website

A comprehensive website for Homeless Aid UK, featuring public information pages and a secure Outreach Portal for volunteer management.

## 🌐 Live Website
- **Main Site**: https://www.homelessaid.co.uk
- **Outreach Portal**: https://www.homelessaid.co.uk/portal/login.html

## 📋 Project Overview

### Main Website
- Public information about Homeless Aid UK services
- Volunteer registration and contact forms
- Food bank directory for Greater Manchester
- Donation information and links

### Outreach Portal
Secure volunteer management system with:
- User authentication (Admin, Team Lead, Volunteer roles)
- Attendance logging and tracking
- Statistics dashboard
- User management (Admin only)

### Volunteer Registration
Volunteers complete their details, upload a photo and sign all policies with one signature at `/portal/registration`. Team Leads and Admins see everyone at `/portal/volunteers`; Admins edit policies at `/portal/policies`. Signatures expire after 12 months or when any policy changes. See `docs/superpowers/specs/2026-10-13-volunteer-registration-design.md`. Run `npm test` for the unit tests and `npm run dev` for a local server (needs `.env`).

## 🔐 Authentication System

### Current Status: ✅ OPERATIONAL (With Security Updates)
The authentication system has been fully debugged and secured as of September 2025.

### Login Credentials
- **Username**: `BenAdmin`
- **Password**: `TestPassword123`
- **Role**: Admin

### Security Updates (September 2025)
- ✅ JWT tokens now use environment variable `JWT_SECRET`
- ✅ All 5 auth endpoints updated for consistent security
- ⚠️ RLS temporarily disabled (working but needs implementation)
- 📁 Safe RLS policies created in `database/rls-policies-fix.sql`

### Key Features
- JWT authentication with 4-hour tokens
- bcrypt password hashing (12 salt rounds)
- Role-based access control
- Environment-based JWT secret management
- Backward compatibility during migration

## 🛠 Technical Stack

### Frontend
- HTML5, CSS3, JavaScript
- Responsive design with mobile support
- Font Awesome icons
- Google Fonts (Inter)

### Backend
- **Hosting**: Vercel (Serverless Functions)
- **Database**: Supabase PostgreSQL
- **Authentication**: Custom JWT implementation
- **Email**: Integrated email services

### API Endpoints
```
Authentication:
├── /api/auth/login          # User login
├── /api/auth/verify         # Token verification
├── /api/auth/setup-password # Password setup
└── /api/auth/verify-invitation # Invitation verification

Attendance:
├── /api/attendance/list     # List logs
├── /api/attendance/log      # Create log
└── /api/attendance/stats    # Statistics

Admin:
├── /api/admin/create-user   # User management
└── /api/send-invitation-email # User invitations

Utility:
└── /api/send-email          # Contact form emails
```

## 🚀 Deployment

### Vercel Configuration
- **Plan**: Hobby (12 function limit)
- **Current Functions**: 11/12
- **Auto-deployment**: Enabled from GitHub

### Environment Variables Required
```bash
SUPABASE_URL
NEXT_PUBLIC_SUPABASE_URL  
SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
JWT_SECRET
```

### Deployment Checklist
- [ ] Function count ≤ 12
- [ ] All environment variables configured
- [ ] Database accessible
- [ ] JWT secrets consistent
- [ ] Build successful

## 📁 Project Structure

```
homeless-aid-uk-website/
├── Outreach/                    # Outreach Portal
│   ├── login.html              # Login page
│   ├── dashboard.html          # Main dashboard
│   └── setup-password.html     # Password setup
├── api/                        # Backend API
│   ├── auth/                   # Authentication endpoints
│   ├── attendance/             # Attendance management
│   ├── admin/                  # Administrative functions
│   └── send-email.js           # Email services
├── utils/                      # Shared utilities
│   ├── auth.js                 # Auth utilities
│   └── supabase.js             # Database connection
├── styles.css                  # Global styles
├── index.html                  # Homepage
├── volunteer.html              # Volunteer page
├── contact.html                # Contact page
├── donate.html                 # Donations page
├── GMFoodBanks.html            # Food banks directory
├── vercel.json                 # Vercel configuration
└── AUTHENTICATION-SYSTEM-GUIDE.md # Detailed auth docs
```

## 🗄 Database Schema

### Users Table (`outreach_users`)
```sql
- id (UUID, Primary Key)
- username (VARCHAR, Unique)  
- email (VARCHAR, Unique)
- full_name (VARCHAR)
- password_hash (VARCHAR)
- role (admin/team_lead/volunteer)
- is_active (BOOLEAN)
- email_verified (BOOLEAN)
- created_at, updated_at, last_login
```

### Security
- Row Level Security (RLS): Currently **DISABLED** 
- Password hashing: bcrypt with 12 salt rounds
- JWT tokens: 4-hour expiration

## 🔧 Development

### Local Development Setup
1. Clone the repository
2. Set up environment variables
3. Install dependencies: `npm install`
4. Test database connection
5. Run local server for testing

### Testing Authentication Locally
```bash
# Test database connection
node -e "
const { createSupabaseClient } = require('./utils/supabase');
const supabase = createSupabaseClient();
supabase.from('outreach_users').select('username').then(console.log);
"

# Generate password hash
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('YourPassword', 12).then(console.log);
"
```

## 📞 Support & Contact

### For Technical Issues
- Check deployment status in Vercel dashboard
- Review `AUTHENTICATION-SYSTEM-GUIDE.md` for detailed troubleshooting
- Monitor function count limits (max 12)

### Contact Information
- **Website**: https://www.homelessaid.co.uk/contact
- **Email**: info@homelessaid.co.uk

## 🔒 Security Notes

### Current Security Status
- ✅ Password encryption (bcrypt)
- ✅ JWT token authentication
- ✅ HTTPS encryption
- ⚠️ Hardcoded JWT secret (temporary)
- ⚠️ RLS disabled for functionality

### Known Limitations
- Hardcoded JWT secret across endpoints (functional requirement)
- RLS policies disabled to prevent infinite recursion
- CORS allows all origins (development setting)

## 📚 Documentation

### Available Documentation
- `AUTHENTICATION-SYSTEM-GUIDE.md` - Comprehensive authentication documentation
- `database-schema.sql` - Database structure and setup
- Inline code comments for API endpoints

### Change Log
- **September 2025**: Major authentication system debugging and fixes
- **August 2025**: Initial Outreach Portal implementation
- **2024**: Main website development

## ⚠️ Important Notes

### Vercel Function Limits
- **Maximum**: 12 functions (Hobby plan)
- **Current**: 11 functions
- **Critical**: Do not add new API endpoints without removing others

### Authentication System
- System is **OPERATIONAL** as of September 2025
- Uses temporary hardcoded JWT secret for compatibility
- RLS disabled for functionality (database policies caused infinite loops)
- Login credentials: BenAdmin / TestPassword123

---

**Status**: ✅ OPERATIONAL  
**Last Updated**: September 2025  
**Version**: 1.0.0