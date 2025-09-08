# Security Migration Guide - Homeless Aid UK
**Date**: September 2025  
**Priority**: HIGH  
**Risk Level**: Medium (system is working but has security vulnerabilities)

## Executive Summary
This guide provides step-by-step instructions to complete the security remediation for the Homeless Aid UK website. The authentication system is currently **working** but has two critical security issues that need addressing:

1. JWT tokens are using a hardcoded secret (now fixed in code, needs environment variable)
2. Row Level Security (RLS) is disabled on the database

## Current State
- ✅ **Authentication Working**: BenAdmin can log in successfully
- ✅ **Code Updated**: All endpoints now check for JWT_SECRET environment variable
- ⚠️ **JWT Secret Not Set**: Falls back to hardcoded value until Vercel env var is set
- ⚠️ **RLS Disabled**: Database has no row-level security active
- ✅ **Backward Compatible**: No breaking changes, zero downtime migration

## Migration Phases

### Phase 1: JWT Secret Deployment (IMMEDIATE - 15 minutes)

#### Step 1: Generate Secure JWT Secret
```bash
# Option A: Use OpenSSL (recommended)
openssl rand -base64 32

# Option B: Use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option C: Use an online generator (less secure)
# Visit: https://generate-secret.vercel.app/32
```

#### Step 2: Set in Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `homeless-aid-uk-website`
3. Navigate to: Settings → Environment Variables
4. Add new variable:
   - **Key**: `JWT_SECRET`
   - **Value**: [Your generated secret from Step 1]
   - **Environment**: ✅ Production, ✅ Preview, ✅ Development
5. Click "Save"

#### Step 3: Trigger Redeployment
```bash
# Option A: Via Vercel Dashboard
# Go to Deployments → Click "Redeploy" on the latest deployment

# Option B: Via Git (if connected)
git commit --allow-empty -m "Trigger redeployment with JWT_SECRET"
git push
```

#### Step 4: Verify JWT Secret is Active
1. Wait for deployment to complete (2-3 minutes)
2. Test login at: https://homelessaid.co.uk/Outreach/login.html
3. Check Vercel Functions logs for any JWT errors
4. Confirm authentication still works with BenAdmin account

### Phase 2: RLS Implementation (OPTIONAL - 30 minutes)

**⚠️ WARNING**: Only proceed if Phase 1 is successful and stable for at least 24 hours.

#### Step 1: Database Backup
```sql
-- In Supabase Dashboard → SQL Editor
-- Export your data first!
SELECT * FROM outreach_users;
SELECT * FROM attendance_logs;
-- Save these results externally
```

#### Step 2: Test RLS Policies
1. Open Supabase Dashboard → SQL Editor
2. Create a new query with contents from `database/rls-policies-fix.sql`
3. Run in **DRY RUN** mode first (if available)
4. Review for any errors

#### Step 3: Apply RLS Policies
```sql
-- Run in a transaction for safety
BEGIN;

-- Apply all policies from rls-policies-fix.sql
-- (Copy the entire file content here)

-- Test a simple query
SELECT * FROM outreach_users WHERE username = 'BenAdmin';

-- If successful:
COMMIT;

-- If any errors:
ROLLBACK;
```

#### Step 4: Test Authentication Flow
1. **Test Login**: https://homelessaid.co.uk/Outreach/login.html
2. **Test Token Verification**: Check if dashboard loads
3. **Test Attendance Logging**: Create a test entry
4. **Test Admin Functions**: If applicable

#### Step 5: Monitor for Issues
- Watch Vercel Function logs for 24 hours
- Check for any "infinite recursion" errors
- Monitor authentication success rate

### Emergency Rollback Procedures

#### Rollback JWT Changes (if login breaks)
```javascript
// Temporary fix: Edit api/auth/login.js locally
const jwtSecret = 'temporary-secret-key'; // Force hardcoded value
// Deploy immediately
```

#### Rollback RLS Policies (if recursion occurs)
```sql
-- IMMEDIATE FIX - Run in Supabase SQL Editor
ALTER TABLE outreach_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs DISABLE ROW LEVEL SECURITY;

-- Clean up policies
DROP POLICY IF EXISTS "Service role bypass" ON outreach_users CASCADE;
DROP POLICY IF EXISTS "Public can read users for login" ON outreach_users CASCADE;
DROP POLICY IF EXISTS "Users can read own data" ON outreach_users CASCADE;
DROP POLICY IF EXISTS "Admins can read all users" ON outreach_users CASCADE;
-- Continue for all policies...
```

## Testing Checklist

### After Phase 1 (JWT Secret)
- [ ] BenAdmin can log in
- [ ] Token generation successful
- [ ] Token verification working
- [ ] Attendance endpoints accessible
- [ ] No JWT errors in logs

### After Phase 2 (RLS Policies)
- [ ] BenAdmin can still log in
- [ ] No infinite recursion errors
- [ ] Attendance logs can be created
- [ ] Attendance logs can be viewed
- [ ] Admin functions work (if applicable)

## Success Criteria
✅ Phase 1 Success:
- JWT_SECRET environment variable is set
- Authentication works without hardcoded secrets
- No breaking changes to existing functionality

✅ Phase 2 Success:
- RLS enabled without recursion
- All user roles function correctly
- Security improved without breaking auth

## Important Notes

### Why RLS Failed Initially
The original RLS policies created infinite recursion because:
1. Policies referenced the same table they were protecting
2. No service role bypass was implemented
3. Public access policies were too restrictive

### How We Fixed It
1. Added service role bypass for backend operations
2. Simplified public access for login checks
3. Used auth.uid() instead of complex joins
4. Separated read and write policies clearly

### Current Workarounds
- **BenAdmin Hardcoded**: Currently bypasses database entirely for reliability
- **Fallback JWT Secret**: Ensures system works even without env var
- **RLS Disabled**: Maintains functionality while security is improved

## Support & Troubleshooting

### Common Issues

**Issue**: "Invalid token" error after setting JWT_SECRET
**Solution**: Clear browser cache and cookies, then login again

**Issue**: "Missing Supabase environment variables"
**Solution**: Ensure all 4 Supabase env vars are set in Vercel

**Issue**: Infinite recursion after enabling RLS
**Solution**: Immediately run rollback SQL commands above

### Getting Help
1. Check Vercel Function logs for detailed errors
2. Review Supabase logs for database issues
3. Test with the `test-auth.js` script locally
4. Document any issues for future reference

## Timeline Recommendation

**Day 1**: Complete Phase 1 (JWT Secret)
**Day 2-7**: Monitor stability
**Day 8**: Consider Phase 2 (RLS) if stable
**Day 9-14**: Monitor RLS implementation
**Day 15**: Full security audit complete

---

*Remember: The system is currently working. Each phase maintains backward compatibility. There's no rush - security improvements should be done carefully to avoid breaking the working authentication.*