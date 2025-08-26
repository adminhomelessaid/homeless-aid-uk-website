# Homeless Aid UK - Volunteer Portal Specification

## System Overview
Complete volunteer management system built on modern web technologies, designed to handle 300+ volunteers with document management, scheduling, and compliance tracking.

## Technology Stack

### Frontend
- **Base**: HTML5, CSS3, Modern JavaScript (ES6+)  
- **Framework**: Next.js 14 (for volunteer portal pages)
- **Styling**: Tailwind CSS + existing CSS
- **State Management**: Zustand (lightweight)
- **Charts/Analytics**: Chart.js
- **PDF Generation**: jsPDF (for certificates)

### Backend & Database  
- **BaaS**: Supabase (PostgreSQL + Auth + Storage + Real-time)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **Email Integration**: Microsoft 365 + Supabase Edge Functions
- **Real-time**: Supabase subscriptions for live updates

### External Services
- **Email**: Microsoft 365 (admin@homelessaid.co.uk, info@, volunteer@)
- **Maps**: Google Maps API (existing postcode integration)
- **Geocoding**: UK Postcodes API (free, existing)
- **Analytics**: Google Analytics 4
- **Monitoring**: Sentry (error tracking)

### Hosting & Deployment
- **Frontend**: Vercel (free tier)
- **Backend**: Supabase (free tier → £20/month when scaling)
- **Domain**: homelessaid.co.uk (existing, via Cloudflare)
- **SSL/CDN**: Cloudflare (existing setup)

## Database Schema

### Core Tables
```sql
-- User Management
volunteers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE NOT NULL,
  full_name varchar NOT NULL,
  phone varchar,
  address jsonb, -- {street, city, postcode, county}
  emergency_contact jsonb, -- {name, phone, relationship}
  date_of_birth date,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  status enum('pending', 'approved', 'active', 'suspended', 'inactive') DEFAULT 'pending',
  role enum('volunteer', 'coordinator', 'admin') DEFAULT 'volunteer',
  profile_image varchar, -- URL to Supabase storage
  notes text -- Admin notes about volunteer
);

-- Volunteer Applications
applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  availability jsonb, -- {monday: ['morning', 'evening'], tuesday: [], ...}
  preferred_locations text[], -- Array of town names
  previous_experience text,
  motivation text, -- Why they want to volunteer
  references jsonb, -- [{name, phone, relationship, email}, ...]
  transport_method enum('car', 'public_transport', 'bicycle', 'walking'),
  dietary_requirements text,
  medical_conditions text,
  criminal_record_declaration boolean DEFAULT false,
  application_date timestamp DEFAULT now(),
  reviewed_date timestamp,
  reviewed_by uuid REFERENCES volunteers(id),
  status enum('submitted', 'under_review', 'approved', 'rejected') DEFAULT 'submitted',
  rejection_reason text
);

-- Training & Certifications
training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  training_type varchar NOT NULL, -- 'food_hygiene', 'safeguarding', 'manual_handling'
  training_provider varchar,
  completed_date timestamp,
  expiry_date timestamp,
  certificate_url varchar, -- Link to stored certificate
  status enum('not_started', 'in_progress', 'completed', 'expired') DEFAULT 'not_started',
  reminder_sent boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- DBS/Background Checks
background_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  check_type enum('dbs_basic', 'dbs_standard', 'dbs_enhanced') DEFAULT 'dbs_basic',
  application_date timestamp,
  completion_date timestamp,
  expiry_date timestamp,
  reference_number varchar,
  status enum('not_required', 'pending', 'in_progress', 'completed', 'expired', 'failed') DEFAULT 'not_required',
  certificate_url varchar,
  notes text
);

-- Document Management
documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  document_type varchar NOT NULL, -- 'volunteer_agreement', 'data_protection', 'code_of_conduct'
  document_name varchar NOT NULL,
  file_path varchar, -- Supabase storage path
  upload_date timestamp DEFAULT now(),
  status enum('pending', 'signed', 'expired') DEFAULT 'pending',
  expiry_date timestamp,
  notes text
);

-- Terms Acceptance (Free DocuSign Alternative)
terms_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  document_type varchar NOT NULL,
  document_version varchar NOT NULL, -- Track different versions
  full_name varchar NOT NULL, -- Typed name for verification
  signature_data text, -- Optional canvas signature (base64)
  ip_address inet,
  user_agent text,
  accepted_at timestamp DEFAULT now(),
  terms_content text -- Store the actual terms they agreed to
);

-- Shift Management
shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location varchar NOT NULL,
  address varchar,
  postcode varchar,
  town varchar,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  volunteer_slots integer DEFAULT 1,
  coordinator_id uuid REFERENCES volunteers(id),
  description text,
  requirements text, -- Special requirements for this shift
  status enum('scheduled', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled',
  created_at timestamp DEFAULT now(),
  created_by uuid REFERENCES volunteers(id)
);

-- Volunteer Shift Assignments
shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES shifts(id) ON DELETE CASCADE,
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  assigned_at timestamp DEFAULT now(),
  assigned_by uuid REFERENCES volunteers(id),
  status enum('invited', 'accepted', 'declined', 'confirmed', 'completed', 'no_show') DEFAULT 'invited',
  response_date timestamp,
  completion_notes text, -- Notes after shift completion
  rating integer CHECK (rating >= 1 AND rating <= 5) -- Optional shift rating
);

-- Communication Logs
communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid REFERENCES volunteers(id) ON DELETE CASCADE,
  communication_type enum('email', 'sms', 'phone', 'in_person') DEFAULT 'email',
  subject varchar,
  content text,
  sent_at timestamp DEFAULT now(),
  sent_by uuid REFERENCES volunteers(id),
  read_at timestamp,
  response text
);

-- System Settings
settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key varchar UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  description text,
  updated_at timestamp DEFAULT now(),
  updated_by uuid REFERENCES volunteers(id)
);

-- Audit Log
audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES volunteers(id),
  action varchar NOT NULL, -- 'create', 'update', 'delete', 'login', 'approve'
  table_name varchar,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp DEFAULT now()
);
```

## User Roles & Permissions

### Public User (Not Logged In)
- ✅ View feeding schedule
- ✅ Access donation pages
- ✅ Submit contact forms
- ✅ Register as volunteer

### Volunteer (Logged In)
- ✅ Complete application process
- ✅ Accept terms and conditions
- ✅ Upload required documents
- ✅ View assigned shifts
- ✅ Accept/decline shift invitations
- ✅ Update personal profile
- ✅ View training requirements
- ✅ Access volunteer resources

### Coordinator
- ✅ All volunteer permissions
- ✅ Create and manage shifts
- ✅ Assign volunteers to shifts
- ✅ View volunteer availability
- ✅ Send communications to volunteers
- ✅ View basic volunteer information

### Admin
- ✅ All coordinator permissions
- ✅ Approve/reject volunteer applications
- ✅ Manage all volunteer records
- ✅ Access compliance dashboard
- ✅ Generate reports and analytics
- ✅ Manage system settings
- ✅ View audit logs
- ✅ Manage user roles

## Feature Specifications

### 1. Volunteer Registration & Onboarding

#### Registration Form
```javascript
// Registration form fields
{
  personal: {
    fullName: string,
    email: string,
    phone: string,
    dateOfBirth: date,
    address: {
      street: string,
      city: string,
      postcode: string,
      county: string
    }
  },
  emergency: {
    name: string,
    phone: string,
    relationship: string
  },
  volunteering: {
    availability: {
      monday: ['morning', 'afternoon', 'evening'],
      tuesday: [],
      // ... other days
    },
    preferredLocations: ['Bolton', 'Manchester', 'Liverpool'],
    transport: 'car' | 'public_transport' | 'bicycle' | 'walking',
    previousExperience: text,
    motivation: text
  },
  references: [{
    name: string,
    phone: string,
    email: string,
    relationship: string
  }],
  declarations: {
    criminalRecord: boolean,
    dataProtection: boolean,
    codeOfConduct: boolean
  }
}
```

#### Onboarding Flow
1. **Registration**: Complete application form
2. **Email Verification**: Verify email address
3. **Document Review**: Admin reviews application
4. **Approval/Rejection**: Admin decision with email notification
5. **Terms Acceptance**: Digital acceptance of volunteer agreement
6. **Training Assignment**: Required training modules assigned
7. **DBS Check**: If required, initiate background check
8. **Activation**: Full access to volunteer portal

### 2. Document Management System

#### Document Types
- **Volunteer Agreement**: Legal agreement for volunteering
- **Code of Conduct**: Behavioral expectations
- **Data Protection Policy**: GDPR compliance
- **Health & Safety Guidelines**: Safety procedures
- **Training Certificates**: Proof of completed training

#### Digital Terms Acceptance
```javascript
// Terms acceptance component
const TermsAcceptance = {
  displayDocument: () => {}, // Show terms in modal/page
  collectSignature: () => {}, // Optional canvas signature
  validateAcceptance: () => {}, // Ensure all requirements met
  recordAcceptance: async (data) => {
    return await supabase.from('terms_acceptance').insert({
      volunteer_id: data.volunteerId,
      document_type: data.documentType,
      document_version: '2025.1',
      full_name: data.typedName,
      signature_data: data.signature, // Optional
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      accepted_at: new Date()
    });
  },
  generateCertificate: () => {}, // Create PDF receipt
}
```

### 3. Shift Management System

#### Shift Creation (Admin/Coordinator)
- **Location Selection**: Choose from feeding schedule locations
- **Date/Time Selection**: Calendar picker with recurring options
- **Volunteer Requirements**: Number of volunteers needed, special skills
- **Automatic Matching**: Suggest volunteers based on availability/location

#### Volunteer Assignment Process
1. **Shift Creation**: Admin creates shift
2. **Volunteer Matching**: System suggests suitable volunteers
3. **Invitation Sent**: Email/notification to selected volunteers
4. **Response Tracking**: Accept/decline with deadline
5. **Confirmation**: Final confirmation 24 hours before shift
6. **Completion**: Post-shift check-in and notes

### 4. Training Management

#### Training Types
- **Food Hygiene Level 2**: Required for food handling
- **Safeguarding Awareness**: Protecting vulnerable adults
- **Manual Handling**: Safe lifting techniques
- **First Aid**: Basic first aid certification
- **Mental Health Awareness**: Supporting those in crisis

#### Training Tracking
- **Assignment**: Admin assigns required training
- **Progress Tracking**: Monitor completion status
- **Certificate Upload**: Volunteers upload certificates
- **Expiry Reminders**: Automatic renewal notifications
- **Compliance Dashboard**: Admin view of all training status

### 5. Communication System

#### Email Templates
- **Welcome Email**: New volunteer confirmation
- **Application Status**: Approval/rejection notifications
- **Shift Invitations**: Volunteer shift assignments
- **Reminders**: Training renewals, upcoming shifts
- **Newsletters**: Monthly updates and recognition

#### Notification Preferences
```javascript
// User notification preferences
{
  email: {
    shiftInvitations: true,
    trainingReminders: true,
    newsletters: false,
    systemUpdates: true
  },
  inApp: {
    shiftUpdates: true,
    messages: true,
    announcements: true
  }
}
```

### 6. Admin Dashboard

#### Key Metrics
- **Total Volunteers**: Active, pending, inactive counts
- **Application Pipeline**: New applications, pending reviews
- **Training Compliance**: Percentage with up-to-date training
- **Shift Coverage**: Upcoming shifts needing volunteers
- **Document Status**: Terms acceptance, missing documents

#### Reports
- **Volunteer Report**: Complete volunteer information export
- **Training Report**: Training compliance by volunteer
- **Shift Report**: Shift attendance and completion rates
- **Compliance Report**: DBS checks, document status
- **Activity Report**: System usage and engagement metrics

## Implementation Timeline (4 Weeks)

### Week 1: Foundation
- **Days 1-2**: Supabase setup, database schema creation
- **Days 3-4**: Authentication system, basic user management  
- **Days 5-7**: Volunteer registration form, admin approval system

### Week 2: Core Features
- **Days 8-9**: Document upload system, terms acceptance
- **Days 10-11**: Training management, certificate tracking
- **Days 12-14**: Basic admin dashboard, volunteer profiles

### Week 3: Advanced Features  
- **Days 15-16**: Shift creation and management system
- **Days 17-18**: Volunteer assignment and scheduling
- **Days 19-21**: Communication system, email integration

### Week 4: Polish & Launch
- **Days 22-23**: Advanced admin features, reporting
- **Days 24-25**: Testing, bug fixes, performance optimization
- **Days 26-28**: User training, documentation, go-live

## Cost Analysis

### Monthly Operational Costs
- **Supabase**: £0 (free tier) → £20/month (when scaling)
- **Vercel**: £0 (free tier)  
- **Microsoft 365**: £4.50/month (email)
- **Google Maps API**: £0-5/month (existing usage)
- **Total**: **£4.50/month** initially → **£29.50/month** at scale

### One-Time Development Costs
- **Development Time**: 160 hours (4 weeks × 40 hours)
- **Testing & QA**: Included in development time
- **Training Materials**: Time for documentation/videos
- **Migration Support**: Included

## Success Metrics

### User Adoption
- **Registration Rate**: Target 80% of existing volunteers register within 3 months
- **Login Frequency**: Target 70% monthly active users
- **Feature Usage**: Track most/least used features for optimization

### Operational Efficiency
- **Application Processing**: Reduce approval time from weeks to days
- **Document Compliance**: Target 95% compliance with required documents
- **Shift Coverage**: Reduce unfilled shifts by 50%
- **Communication Efficiency**: Reduce admin communication time by 60%

### System Performance
- **Uptime**: Target 99.9% availability
- **Load Time**: <3 seconds for all pages
- **Mobile Usage**: Target 70% mobile compatibility
- **Error Rate**: <1% system errors

This specification provides a complete roadmap for building a professional volunteer management system that will transform Homeless Aid UK's operations while remaining cost-effective and scalable.