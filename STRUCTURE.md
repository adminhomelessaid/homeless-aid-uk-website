# Homeless Aid UK - Project Structure

## 📁 Directory Structure

```
homeless-aid-uk/
├── 🌐 Root Pages (Public Website)
│   ├── index.html              # Homepage
│   ├── contact.html           # Contact form
│   ├── donate.html            # Donation page
│   ├── volunteer.html         # Volunteer signup
│   ├── useful-links.html      # Resources/links
│   ├── admin.html             # Admin panel (feeding times)
│   ├── GMFoodBanks.html       # Greater Manchester food banks
│   ├── FoodBanks.html         # Alternative food banks page
│   └── food-bank.html         # Food bank info
│
├── 📁 Outreach/                # Volunteer Portal
│   ├── login.html             # Portal login
│   ├── dashboard.html         # Main dashboard
│   ├── admin.html             # User management
│   ├── account.html           # User account settings
│   ├── events-overview.html   # Events management
│   └── setup-password.html    # Password setup for new users
│
├── 📁 api/                     # Backend APIs (11/12 Vercel limit)
│   ├── admin/
│   │   └── create-user.js     # Create new users
│   ├── attendance/
│   │   ├── list.js           # List attendance logs
│   │   ├── log.js            # Create attendance log
│   │   └── stats.js          # Attendance statistics
│   ├── auth/
│   │   ├── login.js          # User authentication
│   │   ├── logout.js         # User logout
│   │   ├── setup-password.js # Initial password setup
│   │   ├── change-password.js # Change existing password
│   │   ├── update-profile.js # Update user profile
│   │   └── verify-invitation.js # Verify invitation tokens
│   └── send-invitation-email.js # Send user invitations
│
├── 📁 utils/                   # Utilities
│   ├── auth.js               # Authentication helpers
│   └── supabase.js           # Database connection
│
├── 📁 Branding/               # Brand Assets
│   ├── HomelessAidUKLogo.png # Main logo
│   └── supporters.txt        # Supporter list
│
├── 📁 QR Code/                # QR Codes
│   └── homeless aid app.png  # App QR code
│
├── 📁 docs/                   # Documentation
│   └── ARCHIVED_AUTH_DOCS.md # Old authentication docs
│
├── 📁 database/               # Database files
│   └── (SQL schemas and migrations)
│
├── 📁 Screenshot/             # Screenshots
│   └── setup-password-page.jpg
│
├── 📁 _archive/               # Archived files
│   └── test-files/           # Old test files
│
├── 📄 Core Files
│   ├── styles.css            # Main stylesheet
│   ├── script.js             # Main JavaScript
│   ├── admin.js              # Admin panel JS
│   ├── GMFoodBanks.js        # Food banks JS
│   ├── vercel.json           # Vercel configuration
│   ├── package.json          # Node dependencies
│   └── README.md             # Main documentation
│
└── 📄 Documentation
    ├── AUTHENTICATION-SYSTEM-GUIDE.md
    ├── AUTHENTICATION_SYSTEM.md
    ├── OUTREACH_SYSTEM_README.md
    ├── SECURITY_MIGRATION_GUIDE.md
    ├── SUPABASE_SETUP_GUIDE.md
    ├── WEBSITE_DOCUMENTATION.md
    └── STRUCTURE.md (this file)
```

## 🔧 Key Configuration Files

- **vercel.json** - Deployment configuration (11/12 function limit)
- **package.json** - Node.js dependencies (bcryptjs, jsonwebtoken, etc.)
- **.env** - Environment variables (not in repo)

## 📊 Current Status

- **Vercel Functions**: 11/12 (at limit for Hobby plan)
- **Authentication**: Fully operational
- **Database**: Supabase PostgreSQL
- **Hosting**: Vercel

## 🚀 Recent Changes

- Removed test files to `_archive/test-files/`
- Deleted empty duplicate directories (apiauth, apiattendance, Data)
- Removed unused API functions to stay under Vercel limit
- Fixed deployment configuration

## ⚠️ Important Notes

1. **Function Limit**: Cannot add new API endpoints without removing existing ones (Vercel Hobby plan limit)
2. **File Structure**: Current structure is functional but could benefit from reorganization with Vercel Pro
3. **Authentication**: All auth endpoints are working with JWT tokens
4. **Database**: Using Supabase with RLS disabled for functionality