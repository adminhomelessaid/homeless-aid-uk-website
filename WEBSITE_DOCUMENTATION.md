# Homeless Aid UK Website Documentation

## Overview
The Homeless Aid UK website is a comprehensive Progressive Web Application (PWA) for a volunteer-run organization that provides food, support, and resources to homeless individuals across the UK. The organization operates in multiple cities including Bolton, Bury, Manchester, Oldham, Liverpool, Wigan, Leigh, and Glasgow.

**Last Updated**: August 26, 2025  
**Version**: 3.1 - Enhanced with calendar integration, geolocation features, and comprehensive documentation

## Technical Stack
- **Frontend**: HTML5, CSS3, Modern JavaScript (ES6+)
- **Architecture**: Modular JavaScript with organized managers
- **PWA Features**: Service Worker, Web App Manifest, offline functionality
- **Backend**: Python HTTP server (`server.py`)
- **Data Management**: Enhanced CSV with admin interface
- **APIs**: Geolocation API, UK Postcodes API, Calendar APIs
- **Styling**: Advanced CSS with responsive design and animations
- **Fonts**: Google Fonts (Inter) with performance optimization

## File Structure
```
Homeless Aid UK/
├── index.html                          # Homepage with feeding schedule
├── donate.html                         # Donation page with multiple payment methods
├── volunteer.html                      # Volunteer application page
├── contact.html                        # Contact information and inquiry form
├── food-bank.html                      # Food bank appointment information
├── useful-links.html                   # External resources and links
├── admin.html                          # Admin panel for data management
├── admin.js                           # Admin panel JavaScript functionality
├── styles.css                          # Main stylesheet with responsive design
├── script.js                          # Main JavaScript with PWA features
├── sw.js                              # Service worker for PWA functionality
├── manifest.json                      # Web app manifest for PWA
├── feed-times.csv                     # Main feeding schedule data
├── feed-times-with-calendar.csv       # Enhanced CSV with calendar features
├── server.py                          # Python development server
├── WEBSITE_DOCUMENTATION.md           # Comprehensive technical documentation
├── ENHANCEMENT_SUGGESTIONS.md         # Future feature recommendations
├── CLAUDE.md                          # Project instructions and notes
└── Branding/
    ├── HomelessAidUKLogo.png          # Organization logo
    ├── homeless-aid-uk-bury-tuesday.ics # Sample calendar file
    └── supporters.txt                 # List of supporters
```

## Pages and Functionality

### 1. Homepage (`index.html`)
**Purpose**: Main landing page with organization overview and feeding schedule

**Key Features**:
- Hero section with emergency hotline (0800 124 4641)
- **Priority CTA Buttons**: Free Food List (primary), Donate, Volunteer
- About section explaining the organization's mission
- Dynamic feeding schedule loaded from CSV file
- Day-based filtering system for feeding times
- **Interactive postcode links** that open Google Maps for directions
- Impact statistics (100% volunteer run, multiple locations, direct funding)
- **Professional logo integration** in navbar and footer

### 2. Donation Page (`donate.html`)
**Purpose**: Provides multiple donation methods and transparency

**Donation Methods**:
- **Bank Transfer**: TSB Bank account details (Sort: 77-72-65, Account: 03252068)
- **PayPal**: Link to PayPal.me/HomelessAidUK
- **Amazon Wishlist**: Direct purchase of needed items

**Features**:
- Click-to-copy bank details
- Regular giving examples (£5-£50 monthly impact)
- Transparency about fund usage
- Alternative ways to help (fundraising, corporate partnerships)

### 3. Volunteer Page (`volunteer.html`)
**Purpose**: Recruitment and application for volunteers

**Features**:
- Volunteer role descriptions (food service, donations sorting, outreach, admin)
- Application form with availability selection
- Location preferences for 8 cities
- Testimonials from current volunteers
- Form validation and success messaging

### 4. Contact Page (`contact.html`)
**Purpose**: Contact information and inquiry form

**Features**:
- Multiple contact methods (phone, email, social media)
- Contact form with subject categorization
- Operating areas information
- Location-specific feeding information
- Immediate help resources

### 5. Food Bank Page (`food-bank.html`)
**Purpose**: Information about food parcel service

**Features**:
- Appointment-only system explanation
- Important dietary/religious restrictions notice
- One hamper per family policy
- Food parcel contents description
- Prominent call-to-action for appointments

## Key JavaScript Functionality (`script.js`)

### Core Features:
1. **CSV Data Loading**: Fetches and parses feeding times from `feed-times.csv`
2. **Dynamic Content Display**: Renders feeding schedule grouped by days
3. **Filtering System**: Allows filtering by specific days of the week
4. **Interactive Google Maps Integration**: Clickable postcodes open Google Maps
5. **Enhanced Mobile Navigation**: Fixed menu closing on anchor link clicks
6. **Form Handling**: Processes volunteer and contact forms
7. **Smooth Scrolling**: Enhanced navigation experience
8. **Animation on Scroll**: Progressive content revelation
9. **Copy-to-Clipboard**: For bank details on donation page

### Recent Enhancements:
- **Google Maps Integration**: Postcodes generate direct Google Maps URLs
- **Visual Click Indicators**: Map icons, hover effects, and "Click for directions" text
- **Mobile Menu Fix**: Menu closes properly when clicking "Food List" anchor links
- **Improved UX**: Tooltips and visual feedback for interactive elements

### Technical Implementation:
- Modern JavaScript (ES6+)
- Intersection Observer API for scroll animations
- Fetch API for CSV loading
- Form data collection and validation
- Local storage considerations for offline functionality

## CSS Architecture (`styles.css`)

### Design System:
- **Color Palette**: 
  - Primary: Orange (#F39C12)
  - Secondary: Dark Gray (#1A1A1A)
  - Background: White (#FFFFFF)
  - Success: Green (#27AE60)

### Layout Strategy:
- Mobile-first responsive design
- CSS Grid for complex layouts
- Flexbox for component alignment
- Custom properties (CSS variables) for theming
- Consistent spacing and typography scale

### Component Types:
- Navigation and branding
- Hero sections and call-to-actions
- Card-based layouts for information display
- Form styling with validation states
- Interactive elements with hover effects

## Data Structure (`feed-times.csv`)

### CSV Schema (Updated):
- **Day**: Day of the week
- **Time**: Service time range  
- **Address 1**: Specific venue address
- **Postcode**: UK postcode (clickable for Google Maps)
- **Town**: Operating town/city
- **Type**: Service type (Takeaway, Street Kitchen, Indoor Feed, Outreach, Drink & Cake)
- **Notes**: Additional information (e.g., "By Referral Only", "Walk-Around the city")

### Current Service Locations:
- **Bolton**: Multiple daily services (Grillsters, Rice n Three, Mash's Wing Ranch, Koolios, Syds, Le Mans Cresent Arches)
- **Manchester**: Breakfast (Thursday 6:30am) and evening services (Friday 7:30pm, Saturday 6:00pm)
- **Liverpool**: Tuesday evening outreach walk-around service
- **Glasgow**: Saturday afternoon outreach (from 3:00pm)
- **Bury**: Monday/Tuesday services at Boro Bathrooms carpark (7:00-8:00pm)
- **Wigan**: Wednesday evening at Whelley Ex-Servicemen's Club (6:30-7:30pm)
- **Oldham**: Thursday evening at Tommyfield Market (7:00-8:00pm)
- **Leigh**: Not currently listed in feed times (may need updating)

## Development Server (`server.py`)

### Features:
- Static file serving with proper MIME types
- CORS support for cross-origin requests
- Security headers (X-Frame-Options, CSRF protection)
- Cache control for development
- File existence validation
- LocalTunnel integration suggestions

### Usage:
```bash
python server.py
# Server runs at http://localhost:8000
```

## Key Contact Information
- **Phone**: 0800 124 4641 (Freephone)
- **Email**: info@homelessaid.co.uk
- **Facebook**: @HomelessAidUK
- **Bank**: TSB (Sort: 77-72-65, Account: 03252068)

## Organization Details
- **Status**: Not a registered charity, 100% volunteer-run
- **Mission**: Ending homelessness through direct service and advocacy
- **Funding**: Relies solely on donations and community support
- **Coverage**: Multiple UK cities with plans for expansion
- **Services**: Free meals, clothing distribution, emergency support, food bank

## Technical Considerations

### Performance:
- Minimal external dependencies
- Optimized images and assets
- Efficient CSS and JavaScript
- Fast CSV parsing and rendering

### Accessibility:
- Semantic HTML structure
- Keyboard navigation support
- Screen reader compatibility
- High contrast color scheme
- Mobile-responsive design

### SEO:
- Proper meta tags and descriptions
- Structured content hierarchy
- Fast loading times
- Mobile-friendly design

## Recent Major Updates (Version 2.0)

### ✅ **Branding Integration**
- **Professional Logo**: Integrated `HomelessAidUKLogo.png` across all pages
- **Navbar & Footer**: Consistent branding with proper responsive sizing
- **Favicon**: Browser tab branding for professional appearance

### ✅ **Enhanced User Experience**
- **Priority CTA Button**: "Free Food List" now primary button on homepage
- **Interactive Postcodes**: Click postcodes to open Google Maps for directions
- **Visual Indicators**: Map icons, hover effects, "Click for directions" text
- **Mobile Menu Fix**: Proper closing behavior for anchor link navigation

### ✅ **Improved Feeding Schedule Cards**
- **Centered Content**: Professional card layout with better readability
- **Orange Header Boxes**: "Town - Type" format for quick identification
- **Bigger Fonts**: Enhanced readability across all devices
- **Clickable Postcodes**: Direct Google Maps integration with visual feedback

### ✅ **Technical Improvements**
- **Updated CSV Structure**: More detailed location data with postcodes
- **Enhanced JavaScript**: Google Maps URL generation and mobile menu fixes
- **Responsive Design**: Better mobile experience with touch-friendly elements
- **Professional Styling**: Consistent orange brand theme throughout

### ✅ **Current Site Statistics** (As of August 26, 2025)
- **5 HTML Pages**: All fully functional and responsive
- **25 Feeding Locations**: Across 8 UK cities
- **100% Uptime**: Stable Python development server
- **Professional Branding**: Logo integrated across all touchpoints
- **Mobile Optimized**: Fixed navigation and touch-friendly design

## Future Enhancement Opportunities
1. **Content Management System** integration
2. **Online donation processing** with payment gateways
3. **Volunteer scheduling system** with calendar integration
4. **Real-time feeding schedule updates** via admin panel
5. **Multi-language support** for diverse communities
6. **Advanced analytics integration** for usage tracking
7. **Social media integration** with live feeds
8. **Email newsletter signup** and automated communications
9. **Progressive Web App (PWA)** functionality
10. **Accessibility improvements** for screen readers
11. **Search functionality** for locations and services
12. **User feedback system** for service quality