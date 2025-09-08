# Archived Authentication Documentation

**Note**: These documents have been superseded by the main WEBSITE_DOCUMENTATION.md as of September 2025.

## Archived Files
1. **AUTHENTICATION_SYSTEM.md** - Initial auth implementation docs (August 2024)
2. **AUTHENTICATION-SYSTEM-GUIDE.md** - Detailed auth guide (September 2025)

## Why Archived?
These documents contained conflicting information and outdated implementation details. The current authoritative sources are:

### Primary Documentation
- **WEBSITE_DOCUMENTATION.md** - Main website documentation (Updated September 2025)
- **README.md** - Quick reference and current status
- **SECURITY_MIGRATION_GUIDE.md** - Step-by-step security fixes

### Technical References
- **database/rls-policies-fix.sql** - Safe RLS implementation
- **test-auth.js** - Authentication testing script

## Historical Context

### August 2024
- Initial authentication system implementation
- Database schema created
- BenAdmin user added with password BenAdmin123!
- RLS policies caused infinite recursion

### September 2025
- Simplified authentication to fix recursion issues
- Changed BenAdmin password to TestPassword123
- Hardcoded JWT secret as temporary fix
- Disabled RLS to maintain functionality

### September 2025 (Current)
- JWT secret management fixed in all endpoints
- Safe RLS policies created (not yet applied)
- Documentation consolidated
- Migration guide created

---
*For current documentation, see WEBSITE_DOCUMENTATION.md*