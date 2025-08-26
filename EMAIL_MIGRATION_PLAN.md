# Homeless Aid UK - Email Migration Plan

## Current Situation
- **Domain**: homelessaid.co.uk (controlled via 123-reg)
- **Current Email**: info@homelessaid.co.uk forwards to immyahmed@hotmail.com
- **DNS Management**: Cloudflare (managed by Billa's nephew)
- **Domain Privacy**: Active via Domains by Proxy

## Migration Strategy: Email First, Then Website

### Phase 1: Microsoft 365 Email Setup

#### Step 1: Microsoft 365 Business Basic Setup
**Cost**: £4.50/month per user
**Plan**: Business Basic (includes email, web apps, 1TB OneDrive)

**Recommended Email Accounts**:
- **admin@homelessaid.co.uk** → Ben (primary administrator)
- **info@homelessaid.co.uk** → General inquiries (can forward to admin)
- **volunteer@homelessaid.co.uk** → Volunteer coordination
- **donations@homelessaid.co.uk** → Future donation/funding queries

#### Step 2: Domain Verification
1. Sign up for Microsoft 365 Business Basic
2. Add domain: homelessaid.co.uk
3. Microsoft will provide verification TXT record
4. Contact Billa's nephew to add TXT record to Cloudflare DNS

#### Step 3: DNS Configuration (via Cloudflare Admin)
**Required DNS Records**:
```
MX Record: 
- Name: @
- Value: homelessaid-co-uk.mail.protection.outlook.com
- Priority: 0

TXT Record (Verification):
- Name: @
- Value: [Microsoft provided verification code]

TXT Record (SPF):
- Name: @
- Value: v=spf1 include:spf.protection.outlook.com -all

CNAME Record (AutoDiscover):
- Name: autodiscover
- Value: autodiscover.outlook.com
```

#### Step 4: Email Account Creation
1. Create admin@homelessaid.co.uk (Ben)
2. Create info@homelessaid.co.uk 
3. Set up email forwarding/distribution as needed
4. Configure mobile apps and desktop clients

#### Step 5: Testing & Transition
- **Week 1**: Test email delivery both ways (send/receive)
- **Week 2**: Update all external services to use new email addresses
- **Week 3**: Ready for website migration with proper email integration

### Phase 2: Website Migration (After Email Working)

#### Prerequisites
- ✅ Microsoft 365 email fully operational
- ✅ All stakeholders have access to new email addresses
- ✅ Email deliverability confirmed

#### Migration Steps
1. **Hosting Setup**: Supabase + Vercel
2. **Website Deployment**: Deploy rebuilt site to new hosting
3. **DNS Update**: Point domain to new hosting (via Cloudflare)
4. **Email Integration**: Connect website forms to new email system
5. **Go Live**: Switch DNS, test everything
6. **Cleanup**: Notify Linda to remove old hosting

## Contact Information Required

### Immediate Contacts Needed
1. **Billa's Nephew** (Cloudflare Admin)
   - Request Cloudflare dashboard access OR
   - Request DNS changes on your behalf
   - Needed for: MX records, TXT records, A records

2. **Linda** (Current Hosting)
   - Inform about timeline for hosting removal
   - Coordinate handover once migration complete

### Microsoft 365 Setup Requirements
- **Admin Email**: Use your personal email initially for setup
- **Phone**: For 2FA verification
- **Payment Method**: Credit/debit card for monthly billing
- **Domain**: homelessaid.co.uk (you own this via 123-reg)

## Timeline & Costs

### Week 1: Email Migration
- **Actions**: Microsoft 365 signup, DNS changes, testing
- **Cost**: £4.50/month (ongoing)
- **Deliverables**: Working professional email system

### Week 2: Email Integration
- **Actions**: Update all services, test deliverability, train users
- **Cost**: £0 (setup time only)
- **Deliverables**: All communications using new email system

### Week 3: Website Migration
- **Actions**: Deploy new site, update DNS, go live
- **Cost**: £0 (Supabase free tier, Vercel free tier)
- **Deliverables**: New website with volunteer portal

### Week 4: Full System Integration
- **Actions**: Connect email automation, volunteer notifications
- **Cost**: £0
- **Deliverables**: Complete integrated system

## Benefits of Email-First Approach

### Operational Benefits
- ✅ **Zero email downtime** during website migration
- ✅ **Professional appearance** for all charity communications
- ✅ **Better deliverability** than current Hotmail forwarding
- ✅ **Centralized management** of all email accounts
- ✅ **Microsoft ecosystem integration** (Teams, OneDrive, etc.)

### Technical Benefits
- ✅ **Email automation ready** for volunteer portal
- ✅ **GDPR compliance** with Microsoft's data handling
- ✅ **Advanced security** (2FA, encryption, spam filtering)
- ✅ **Mobile app support** for all devices
- ✅ **Unified inbox** management

### Future-Proofing Benefits
- ✅ **Scalable** - easily add more email accounts
- ✅ **Integration ready** for volunteer management system
- ✅ **Professional credibility** with donors and partners
- ✅ **Backup and archiving** included
- ✅ **Calendar integration** for volunteer scheduling

## Risk Mitigation

### Potential Issues & Solutions
1. **DNS Changes Delayed**
   - **Risk**: Billa's nephew unavailable
   - **Solution**: Get Cloudflare access directly, or use alternative DNS

2. **Email Delivery Issues**
   - **Risk**: Emails not reaching recipients
   - **Solution**: SPF/DKIM records, gradual transition, testing

3. **User Training Required**
   - **Risk**: Volunteers confused by new email system
   - **Solution**: Simple setup guide, gradual rollout

4. **Cost Concerns**
   - **Risk**: Monthly costs for charity
   - **Solution**: Start with essential accounts, add as needed

## Next Actions When Ready

### Immediate (Day 1)
1. **Sign up for Microsoft 365 Business Basic**
   - Go to admin.microsoft.com
   - Choose Business Basic plan
   - Add homelessaid.co.uk domain

2. **Contact Billa's nephew**
   - Request Cloudflare DNS access OR
   - Provide DNS records for him to add

### Follow-up (Week 1)
1. **Complete domain verification**
2. **Create admin@homelessaid.co.uk account**
3. **Test email delivery both directions**
4. **Set up mobile/desktop email clients**

### Ongoing (Week 2+)
1. **Update all external services** with new email addresses
2. **Train key volunteers** on new email system
3. **Prepare for website migration** once email stable

---

## Technical Notes

### Current Domain Configuration
- **Registrar**: 123-reg.com
- **Owner**: Imtiaz Ahmed (immyahmed@hotmail.com)
- **DNS**: Managed by Cloudflare (erin.ns.cloudflare.com, mark.ns.cloudflare.com)
- **Privacy**: Active via Domains by Proxy

### Cloudflare Benefits (Keep Active)
- **Security**: DDoS protection, firewall
- **Performance**: Global CDN, caching
- **SSL**: Free SSL certificates
- **Analytics**: Traffic insights

### Microsoft 365 Integration Points
- **Website Forms**: Contact forms email to info@homelessaid.co.uk
- **Volunteer Portal**: Registration confirmations, notifications
- **Admin Panel**: System alerts, reports
- **Automation**: Welcome emails, reminders, updates

---

This email-first approach ensures a smooth transition with minimal disruption to operations while setting up a professional foundation for the expanded volunteer management system.