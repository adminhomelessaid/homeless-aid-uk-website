# Homeless Aid UK Website Migration Plan

## Executive Summary
This document outlines the comprehensive plan to migrate from the current WordPress-based website (https://homelessaid.co.uk/) to the new HTML/JavaScript-based website currently in development.

**Target Migration Date**: TBD (Recommended 30-60 days after approval)  
**Estimated Downtime**: <4 hours (with proper planning)  
**Risk Level**: Low to Medium  

---

## Current Website Analysis

### Current Website (https://homelessaid.co.uk/)
- **Technology**: WordPress with Elementor page builder
- **Hosting**: Google Cloud Platform (GCP) - IP: 35.214.115.76
- **Server**: Nginx with PHP support
- **Domain**: homelessaid.co.uk (likely registered through a domain registrar)
- **Features**: Basic WordPress site with WooCommerce, PayPal integration
- **Content**: Mission statement, donation links, basic information
- **SEO**: Limited optimization, basic WordPress structure

### New Website (Rebuilt Version)
- **Technology**: HTML5, CSS3, Modern JavaScript (ES6+)
- **Architecture**: Progressive Web Application (PWA)
- **Features**: 
  - Dynamic feeding schedule with 25+ locations
  - Geolocation services
  - Calendar integration
  - Multiple donation methods
  - Volunteer application system
  - Food bank information
  - Admin panel for content management
- **Data**: CSV-based with admin interface
- **Mobile**: Fully responsive, installable PWA

---

## Migration Strategy

### Phase 1: Pre-Migration Preparation (Weeks 1-2)

#### 1.1 Domain & Hosting Research
- **Action Required**: Identify current domain registrar
  - Check WHOIS records for homelessaid.co.uk
  - Contact current domain manager/administrator
  - Verify domain renewal dates and transfer locks
- **Backup Plan**: Register backup domain (homelessaiduk.org or similar)

#### 1.2 Content Audit & Migration
- **WordPress Content Extraction**:
  - Export all pages, posts, images from current WordPress site
  - Document all custom plugins and functionality
  - Screenshot all pages for reference
  - Extract supporter/partner information
  - Save all contact forms and submissions

- **Content Mapping**:
  ```
  Current WordPress → New HTML Site
  ├── Home Page → index.html (enhanced with feeding schedule)
  ├── About → Integrated into index.html
  ├── Donate → donate.html (enhanced with multiple options)
  ├── Contact → contact.html (enhanced form)
  ├── Blog/News → Consider adding news section
  └── Other Pages → Map to appropriate new pages
  ```

#### 1.3 SEO Preservation
- **URL Mapping**: Document all current URLs and create redirects
- **Meta Tags**: Transfer all SEO meta descriptions, titles
- **Schema Markup**: Implement structured data for charity/organization
- **Analytics**: Set up Google Analytics on new site before migration

### Phase 2: Technical Setup (Weeks 2-3)

#### 2.1 Hosting Selection
**Recommended Options**:

1. **Google Cloud Platform** (Current hosting - easier migration)
   - Cost: ~$10-30/month
   - Pros: Same provider, familiar environment
   - Cons: More complex setup for static sites

2. **Netlify** (Recommended for static sites)
   - Cost: Free tier available, $19/month for pro
   - Pros: Excellent for static sites, automatic deployments, forms handling
   - Cons: Learning curve for current administrators

3. **Vercel** (Alternative)
   - Cost: Free tier available, $20/month for pro
   - Pros: Excellent performance, easy deployments
   - Cons: Less traditional hosting experience

4. **Traditional Shared Hosting** (SiteGround, Bluehost)
   - Cost: $5-15/month
   - Pros: Familiar interface, good support
   - Cons: Less modern features

**Recommendation**: Start with Netlify for easy deployment and static hosting optimization.

#### 2.2 Domain Configuration
- **DNS Management**:
  - Set up DNS records with new hosting provider
  - Configure MX records for email (info@homelessaid.co.uk)
  - Set up CNAME for www subdomain
  - Configure SSL certificates (Let's Encrypt or provider SSL)

#### 2.3 Email Preservation
- **Current Email**: info@homelessaid.co.uk
- **Options**:
  - Google Workspace (G Suite) - $6/month per user
  - Microsoft 365 - $6/month per user  
  - Forward to existing Gmail/Outlook accounts
- **Setup**: Configure MX records to maintain email functionality

### Phase 3: Testing & Staging (Week 3-4)

#### 3.1 Staging Environment
- **Staging URL**: Use temporary subdomain (staging.homelessaid.co.uk)
- **Testing Checklist**:
  - All links working correctly
  - Contact forms submitting properly
  - Feeding schedule displaying correctly
  - Mobile responsiveness across devices
  - PWA installation working
  - Admin panel functionality
  - Calendar integration
  - Geolocation features

#### 3.2 Content Population
- **Data Entry**:
  - Verify all feeding times are accurate and up-to-date
  - Populate supporter information
  - Add any missing content from current site
  - Test all contact forms and automation

#### 3.3 User Acceptance Testing
- **Stakeholders**: Organization volunteers and leadership
- **Testing Areas**:
  - Easy of finding feeding times
  - Donation process flow
  - Volunteer application process
  - Admin panel usability
  - Mobile experience

### Phase 4: Go-Live Migration (Week 4)

#### 4.1 Pre-Migration Checklist
- [ ] Final content review and approval
- [ ] All testing completed successfully
- [ ] DNS records prepared but not switched
- [ ] Email forwarding configured
- [ ] Backup of current WordPress site created
- [ ] New site fully deployed on staging
- [ ] SSL certificates ready
- [ ] Analytics and tracking codes installed

#### 4.2 Migration Day Timeline

**T-24 hours**:
- Final backup of current WordPress site
- Notify stakeholders of upcoming migration
- Prepare rollback plan

**T-4 hours** (Recommended: Early morning UK time):
1. **Step 1** (15 mins): Update DNS A record to point to new hosting
2. **Step 2** (30 mins): Wait for DNS propagation (test from multiple locations)
3. **Step 3** (15 mins): Verify new site is loading correctly
4. **Step 4** (30 mins): Test all functionality on live domain
5. **Step 5** (15 mins): Set up redirects from old URLs to new structure
6. **Step 6** (30 mins): Monitor for any issues

**T+1 hour**: Full functionality testing
**T+4 hours**: Complete migration verification
**T+24 hours**: Monitor analytics and user reports

#### 4.3 Post-Migration Tasks
- Monitor website analytics for traffic patterns
- Set up 301 redirects for any missed URLs
- Update all external links (social media, printed materials)
- Notify Google of site changes via Search Console
- Submit updated sitemap

### Phase 5: Optimization & Monitoring (Ongoing)

#### 5.1 Performance Monitoring
- **Tools**: Google PageSpeed Insights, GTmetrix
- **Targets**: <3 second load time, >90 mobile performance score
- **Regular Reviews**: Weekly for first month, then monthly

#### 5.2 SEO Monitoring
- **Tools**: Google Search Console, Google Analytics
- **Track**: Organic traffic recovery, ranking positions
- **Expected**: 2-4 weeks for full search engine re-indexing

#### 5.3 User Feedback Integration
- **Collection**: Contact forms, social media feedback
- **Response**: Address any usability issues quickly
- **Improvements**: Regular updates based on user needs

---

## Risk Assessment & Mitigation

### High Risk Issues
1. **Domain Transfer Complications**
   - **Risk**: Cannot access domain controls
   - **Mitigation**: Research domain registrar early, have backup domains ready
   - **Contingency**: Use redirect from new domain temporarily

2. **Email Disruption**
   - **Risk**: Loss of email functionality during migration
   - **Mitigation**: Set up email forwarding before DNS changes
   - **Contingency**: Use Gmail/Outlook temporarily

3. **SEO Traffic Loss**
   - **Risk**: Temporary drop in search rankings
   - **Mitigation**: Proper 301 redirects, sitemap submission
   - **Recovery**: 2-4 weeks for full recovery expected

### Medium Risk Issues
1. **User Confusion**
   - **Risk**: Users cannot find familiar information
   - **Mitigation**: Clear navigation, comprehensive testing
   - **Support**: Provide help documentation

2. **Functionality Gaps**
   - **Risk**: Missing features from old site
   - **Mitigation**: Thorough content audit, feature comparison
   - **Resolution**: Quick updates post-launch

### Low Risk Issues
1. **Performance Issues**
   - **Risk**: Site loading slowly
   - **Mitigation**: CDN setup, optimized hosting
   - **Monitoring**: Regular performance testing

---

## Budget Estimate

### One-Time Costs
- Domain transfer fees: £0-15
- SSL certificate: £0 (Let's Encrypt) - £50/year (premium)
- Migration services: £0 (DIY) - £500 (professional)
- Testing and QA: £0 (volunteer) - £300 (professional)

### Ongoing Monthly Costs
- **Hosting**: £0-20/month (depending on provider and traffic)
- **Email**: £0-6/month (depending on solution)
- **Monitoring tools**: £0-10/month
- **Backup services**: £0-5/month

**Total Estimated Monthly Cost**: £0-40/month  
**Current hosting cost unknown** - likely £10-50/month for WordPress hosting

---

## Success Metrics

### Technical Metrics
- **Uptime**: >99.9%
- **Load Time**: <3 seconds
- **Mobile Performance**: >90 (Google PageSpeed)
- **SEO Recovery**: Within 4 weeks

### User Experience Metrics
- **Bounce Rate**: <60%
- **Session Duration**: >2 minutes
- **Pages per Session**: >2
- **Mobile Usage**: >60% (expected)

### Business Metrics
- **Feeding Schedule Usage**: Track clicks on location postcodes
- **Volunteer Applications**: Track form submissions
- **Donation Referrals**: Track clicks to donation pages
- **Contact Form Submissions**: Monthly comparison

---

## Rollback Plan

### Scenario: Critical Issues Post-Migration
1. **Immediate Action** (within 1 hour):
   - Revert DNS A record to original IP (35.214.115.76)
   - Notify stakeholders of temporary rollback
   
2. **Assessment** (within 4 hours):
   - Identify specific issues
   - Determine fix timeline
   - Communicate plan to stakeholders

3. **Resolution Options**:
   - **Quick Fix**: Address issues and re-migrate within 24-48 hours
   - **Extended Fix**: Return to old site while resolving complex issues
   - **Gradual Migration**: Migrate sections of site individually

---

## Recommended Next Steps

### Immediate Actions (This Week)
1. **Domain Research**: Identify current registrar and access credentials
2. **Content Backup**: Export all content from current WordPress site  
3. **Stakeholder Meeting**: Review this plan with organization leadership
4. **Hosting Decision**: Choose hosting provider and set up staging environment

### Week 1-2 Actions
1. **Staging Setup**: Deploy new site to staging environment
2. **Content Migration**: Populate new site with current content
3. **Email Setup**: Configure email hosting/forwarding
4. **Testing Plan**: Develop comprehensive testing checklist

### Week 3-4 Actions
1. **User Testing**: Have volunteers test staging site
2. **Final Content Review**: Ensure all information is current
3. **Go-Live Preparation**: Prepare all technical requirements
4. **Migration Execution**: Execute migration plan

---

## Conclusion

The migration from the current WordPress-based site to the new HTML/JavaScript-based site will provide significant improvements in functionality, user experience, and maintainability. The new site offers:

- **Enhanced User Experience**: Dynamic feeding schedules, geolocation, PWA features
- **Better Performance**: Faster loading, mobile optimization
- **Improved Functionality**: Admin panel, calendar integration, advanced forms
- **Lower Maintenance**: Simpler technology stack, easier updates

With proper planning and execution, this migration can be completed with minimal disruption and maximum benefit to the organization's mission of helping those in need.

**Recommended Timeline**: 4-6 weeks from approval to go-live  
**Key Success Factor**: Thorough testing and stakeholder communication throughout process