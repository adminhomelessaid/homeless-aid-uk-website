console.log('🚀 Script.js is loaded!');


// Configuration
const CONFIG = {
    csvUrl: 'feed-times.csv',
    searchDebounce: 300,
    cacheExpiry: 3600000, // 1 hour
    defaultFilters: ['all'],
    geolocation: {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
    }
};

// Calendar status indicators
const calendarStatuses = {
    enabled: { icon: '📅', text: 'Calendar Available' },
    disabled: { icon: '🚫', text: 'Calendar Not Available' },
    referral: { icon: '📞', text: 'By Referral Only' }
};

// Geolocation manager
const GeolocationManager = {
    userLocation: null,
    isSupported: 'geolocation' in navigator,
    
    async getCurrentLocation() {
        if (!this.isSupported) {
            throw new Error('Geolocation not supported');
        }
        
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    console.log('📍 User location obtained:', this.userLocation);
                    resolve(this.userLocation);
                },
                (error) => {
                    console.error('❌ Geolocation error:', error);
                    reject(error);
                },
                CONFIG.geolocation
            );
        });
    },
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        // Haversine formula for calculating distance between two coordinates
        const R = 3959; // Earth's radius in miles
        const dLat = this.toRadian(lat2 - lat1);
        const dLng = this.toRadian(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadian(lat1)) * Math.cos(this.toRadian(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },
    
    toRadian(degree) {
        return degree * (Math.PI / 180);
    },
    
    async getCoordinatesFromPostcode(postcode) {
        if (!postcode || !postcode.trim()) return null;
        
        try {
            // Use UK postcode API
            const response = await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s+/g, '')}`);
            if (response.ok) {
                const data = await response.json();
                return {
                    lat: data.result.latitude,
                    lng: data.result.longitude
                };
            }
        } catch (error) {
            console.warn('⚠️ Failed to geocode postcode:', postcode, error);
        }
        return null;
    }
};

// Calendar manager
const CalendarManager = {
    parseTime: parseTimeToDate,
    generateGoogle: null, // Will be set later
    generateICS: null, // Will be set later
    openModal: null, // Will be set later
    
    getStatusInfo(item) {
        const isReferralOnly = item.Notes && item.Notes.toLowerCase().includes('referral');
        const isCalendarEnabled = item['Enable Calendar'] && item['Enable Calendar'].toLowerCase() === 'yes';
        
        if (isReferralOnly) {
            return { type: 'referral', ...calendarStatuses.referral };
        } else if (isCalendarEnabled) {
            return { type: 'enabled', ...calendarStatuses.enabled };
        } else {
            return { type: 'disabled', ...calendarStatuses.disabled };
        }
    }
};

// Load and display feeding times from CSV
async function loadFeedingTimes() {
    const feedingContainer = document.getElementById('feeding-times');
    if (!feedingContainer) return;
    
    try {
        console.log('📥 Attempting to fetch CSV file...');
        const response = await fetch('feed-times.csv');
        console.log('📊 CSV response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.text();
        console.log('✅ CSV data loaded, length:', data.length, 'characters');
        
        // Parse CSV
        const lines = data.split('\n');
        const headers = lines[0].split(',');
        const feedingTimes = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length === headers.length) {
                const entry = {};
                headers.forEach((header, index) => {
                    entry[header.trim()] = values[index].trim();
                });
                
                // Parse LatLong field into separate lat and lng
                if (entry.LatLong && entry.LatLong.trim()) {
                    const coords = entry.LatLong.split(',');
                    if (coords.length === 2) {
                        entry.lat = parseFloat(coords[0]);
                        entry.lng = parseFloat(coords[1]);
                    }
                }
                
                feedingTimes.push(entry);
            }
        }
        
        // Sort by day of week
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        feedingTimes.sort((a, b) => {
            const dayA = dayOrder.indexOf(a.Day);
            const dayB = dayOrder.indexOf(b.Day);
            return dayA - dayB;
        });
        
        // Store original data
        window.feedingData = feedingTimes;
        
        // Display all feeding times initially
        displayFeedingTimes(feedingTimes);
        
    } catch (error) {
        console.error('Error loading feeding times:', error);
        feedingContainer.innerHTML = '<p>Sorry, unable to load feeding times. Please try again later.</p>';
    }
}

// Display feeding times grouped by day
async function displayFeedingTimes(data) {
    const container = document.getElementById('feeding-times');
    if (!container) return;
    
    if (data.length === 0) {
        container.innerHTML = '<p>No feeding times found for the selected filter.</p>';
        return;
    }
    
    // Add distance calculations if user location is available
    if (GeolocationManager.userLocation) {
        for (let item of data) {
            // Use stored coordinates from LatLong field
            if (item.lat && item.lng) {
                const distance = GeolocationManager.calculateDistance(
                    GeolocationManager.userLocation.lat,
                    GeolocationManager.userLocation.lng,
                    item.lat,
                    item.lng
                );
                item.distance = distance;
            }
        }
        
        // Sort by distance if available
        data.sort((a, b) => {
            if (a.distance !== undefined && b.distance !== undefined) {
                return a.distance - b.distance;
            }
            return 0;
        });
    }
    
    // Group data by day
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const groupedByDay = {};
    
    data.forEach(item => {
        if (!groupedByDay[item.Day]) {
            groupedByDay[item.Day] = [];
        }
        groupedByDay[item.Day].push(item);
    });
    
    // Create HTML for each day section
    let html = '';
    dayOrder.forEach(day => {
        if (groupedByDay[day] && groupedByDay[day].length > 0) {
            html += `<div class="day-section">`;
            html += `<h3 class="day-header">EVERY ${day}</h3>`;
            html += `<div class="day-cards">`;
            
            groupedByDay[day].forEach((item, index) => {
                // Generate unique ID for modal functionality
                const uniqueId = `event-${day.toLowerCase()}-${index}`;
                
                // Create Google Maps link using coordinates if available, otherwise fallback to postcode
                let mapsUrl = '#';
                if (item.lat && item.lng) {
                    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
                } else if (item.Postcode && item.Postcode.trim()) {
                    mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.Postcode + ' UK')}`;
                }
                
                // Distance display
                const distanceHtml = item.distance !== undefined ? 
                    `<div class="feeding-distance">${item.distance.toFixed(1)} miles</div>` : '';
                
                html += `
                    <div class="event-card" data-event-id="${uniqueId}">
                        ${distanceHtml}
                        <div class="card-header">
                            <div class="event-type">
                                <span class="town">${item.Town}</span>
                                <span class="event-category-tag">${item.Type}</span>
                            </div>
                            <h4 class="venue-name">${item.Name || item['Address 1']}</h4>
                        </div>
                        <div class="card-body">
                            <div class="address-section" onclick="window.open('${mapsUrl}', '_blank')">
                                <i class="fas fa-map-marker-alt"></i>
                                <div class="address-text">
                                    ${item['Address 1']}<br>
                                    <strong>${item.Postcode ? item.Postcode + ' • ' : ''}Click for directions</strong>
                                </div>
                            </div>
                            <div class="time-section">
                                <i class="fas fa-clock"></i>
                                <span>${item.StartTime} - ${item.EndTime}</span>
                            </div>
                        </div>
                        <div class="card-footer">
                            <div class="card-actions">
                                ${item['Enable Calendar'] === 'Yes' ? 
                                    `<button class="calendar-badge" onclick="openCalendarModalForEvent('${uniqueId}')">
                                        <i class="fas fa-calendar-plus"></i> 
                                        Add to Calendar
                                    </button>` : 
                                    item.Notes && item.Notes.trim() ? 
                                    `<div class="notes-badge">
                                        <i class="fas fa-phone"></i>
                                        ${item.Notes}
                                    </div>` : ''
                                }
                                <button class="btn more-info-btn" onclick="openInfoModal('${uniqueId}')">
                                    <i class="fas fa-info-circle"></i> 
                                    More Info
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                // Store event data for modal access
                if (!window.eventDataStore) window.eventDataStore = {};
                window.eventDataStore[uniqueId] = item;
            });
            
            html += `</div></div>`;
        }
    });
    
    container.innerHTML = html;
    
    // Debug: Check calendar buttons after HTML is set
    const calendarButtonsAfter = document.querySelectorAll('.calendar-btn');
    console.log('🎯 Calendar buttons after HTML update:', calendarButtonsAfter.length);
}

// Search functionality for feeding locations
function setupSearch() {
    const searchInput = document.getElementById('locationSearch');
    const clearButton = document.getElementById('clearSearch');
    
    if (!searchInput || !clearButton) return;
    
    let searchTimeout;
    
    function performSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const filterButtons = document.querySelectorAll('.filter-btn');
        
        if (searchTerm === '') {
            clearButton.style.display = 'none';
            // Show all data based on current day filter
            const activeFilter = document.querySelector('.filter-btn.active');
            const currentFilter = activeFilter ? activeFilter.dataset.filter : 'all';
            applyFilters(currentFilter, '');
            return;
        }
        
        clearButton.style.display = 'flex';
        
        // Reset day filter to show all days when searching
        filterButtons.forEach(btn => btn.classList.remove('active'));
        filterButtons[0].classList.add('active'); // Set "All Days" as active
        
        applyFilters('all', searchTerm);
    }
    
    function applyFilters(dayFilter, searchTerm) {
        if (!window.feedingData) return;
        
        let filtered = window.feedingData;
        
        // Apply day filter
        if (dayFilter !== 'all') {
            filtered = filtered.filter(item => item.Day === dayFilter);
        }
        
        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter(item => {
                const searchableText = [
                    item.Town || '',
                    item['Address 1'] || '',
                    item.Postcode || '',
                    item.Type || '',
                    item.Notes || ''
                ].join(' ').toLowerCase();
                
                return searchableText.includes(searchTerm);
            });
        }
        
        displayFeedingTimes(filtered);
    }
    
    // Search input event listener with debouncing
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    });
    
    // Clear search functionality
    clearButton.addEventListener('click', function() {
        searchInput.value = '';
        clearButton.style.display = 'none';
        // Restore current day filter
        const activeFilter = document.querySelector('.filter-btn.active');
        const currentFilter = activeFilter ? activeFilter.dataset.filter : 'all';
        applyFilters(currentFilter, '');
        searchInput.focus();
    });
    
    // Update the existing filter setup to work with search
    window.applyFilters = applyFilters;
}

// Filter feeding times by day
function setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');
            
            const filter = this.dataset.filter;
            const searchInput = document.getElementById('locationSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            // Use the shared applyFilters function
            if (window.applyFilters) {
                window.applyFilters(filter, searchTerm);
            }
        });
    });
}

// Mobile menu toggle
function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.classList.toggle('active');
    }
}

// Handle volunteer form submission
function handleVolunteerSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Collect form data
    const volunteerData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        location: formData.get('location'),
        availability: formData.getAll('availability'),
        help: formData.get('help')
    };
    
    // In a real application, this would send to a server
    console.log('Volunteer application submitted:', volunteerData);
    
    // Hide form and show success message
    form.style.display = 'none';
    const successMessage = document.getElementById('successMessage');
    if (successMessage) {
        successMessage.style.display = 'block';
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Reset form after 5 seconds and show form again
    setTimeout(() => {
        form.reset();
        form.style.display = 'block';
        if (successMessage) {
            successMessage.style.display = 'none';
        }
    }, 5000);
}

// Handle contact form submission
function handleContactSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Collect form data
    const contactData = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject'),
        message: formData.get('message')
    };
    
    // In a real application, this would send to a server
    console.log('Contact form submitted:', contactData);
    
    // Hide form and show success message
    form.style.display = 'none';
    const successMessage = document.getElementById('contactSuccessMessage');
    if (successMessage) {
        successMessage.style.display = 'block';
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Reset form after 5 seconds and show form again
    setTimeout(() => {
        form.reset();
        form.style.display = 'block';
        if (successMessage) {
            successMessage.style.display = 'none';
        }
    }, 5000);
}

// Form validation helper
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return true;
    
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = 'red';
            isValid = false;
        } else {
            field.style.borderColor = '';
        }
    });
    
    return isValid;
}

// Smooth scroll for anchor links
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            // Skip if it's just a hash (#) or part of calendar modal
            if (href === '#' || this.closest('.calendar-options') || this.classList.contains('calendar-option')) {
                return; // Don't prevent default, let other handlers work
            }
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Add active navigation state based on current page
function setActiveNav() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPage) {
            link.classList.add('active');
        }
    });
}

// Close mobile menu when clicking outside or on nav links
function setupMobileMenuClose() {
    document.addEventListener('click', function(event) {
        const navLinks = document.querySelector('.nav-links');
        const menuBtn = document.querySelector('.mobile-menu-btn');
        const navBar = document.querySelector('.navbar');
        
        if (navLinks && navLinks.classList.contains('active')) {
            // Close menu if clicking outside navbar or on any nav link
            if (!navBar.contains(event.target) || event.target.closest('.nav-links a')) {
                navLinks.classList.remove('active');
            }
        }
    });
}

// Animation on scroll
function setupScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Add animation to cards
    const animatedElements = document.querySelectorAll('.impact-card, .help-card, .feeding-card, .donation-card, .role-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });
}

// Format phone numbers
function formatPhoneNumbers() {
    const phoneElements = document.querySelectorAll('.hotline-number, .contact-link[href^="tel:"]');
    phoneElements.forEach(el => {
        const phone = el.textContent.replace(/\D/g, '');
        if (phone.length === 11) {
            const formatted = phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
            if (el.tagName === 'A') {
                el.textContent = formatted;
            }
        }
    });
}

// Setup Near Me functionality
function setupNearMe() {
    const nearMeBtn = document.getElementById('nearMeBtn');
    if (!nearMeBtn) return;
    
    // Check if geolocation is supported
    if (!GeolocationManager.isSupported) {
        nearMeBtn.style.display = 'none';
        return;
    }
    
    nearMeBtn.addEventListener('click', async function() {
        const btnIcon = this.querySelector('i');
        const btnText = this.querySelector('span');
        
        // Show loading state
        this.classList.add('loading');
        this.disabled = true;
        btnText.textContent = 'Getting location...';
        
        try {
            await GeolocationManager.getCurrentLocation();
            btnText.textContent = 'Location found!';
            
            // Refresh the display with distances
            if (window.feedingData) {
                await displayFeedingTimes([...window.feedingData]);
            }
            
            // Update button to show success
            setTimeout(() => {
                btnText.textContent = 'Near Me';
                this.classList.remove('loading');
                this.disabled = false;
            }, 1500);
            
        } catch (error) {
            console.error('❌ Failed to get location:', error);
            btnText.textContent = 'Location failed';
            
            // Show error message to user
            let errorMessage = 'Unable to get your location. ';
            if (error.code === 1) {
                errorMessage += 'Please allow location access.';
            } else if (error.code === 2) {
                errorMessage += 'Location unavailable.';
            } else {
                errorMessage += 'Please try again.';
            }
            
            // You could show this in a toast/notification
            console.warn(errorMessage);
            
            setTimeout(() => {
                btnText.textContent = 'Near Me';
                this.classList.remove('loading');
                this.disabled = false;
            }, 2000);
        }
    });
}

// Touch gesture manager for mobile swipe navigation
const TouchManager = {
    startX: 0,
    startY: 0,
    threshold: 50,
    
    init() {
        const filterButtons = document.querySelector('.filter-buttons');
        if (!filterButtons) return;
        
        filterButtons.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        filterButtons.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: true });
        filterButtons.addEventListener('touchend', this.handleTouchEnd.bind(this));
    },
    
    handleTouchStart(e) {
        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
    },
    
    handleTouchMove(e) {
        if (!this.startX || !this.startY) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        
        const diffX = this.startX - currentX;
        const diffY = this.startY - currentY;
        
        // Only handle horizontal swipes
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.threshold) {
            if (diffX > 0) {
                this.swipeLeft();
            } else {
                this.swipeRight();
            }
            this.startX = 0;
            this.startY = 0;
        }
    },
    
    handleTouchEnd() {
        this.startX = 0;
        this.startY = 0;
    },
    
    swipeLeft() {
        // Navigate to next day
        const activeFilter = document.querySelector('.filter-btn.active');
        const nextFilter = activeFilter?.nextElementSibling;
        if (nextFilter && nextFilter.classList.contains('filter-btn')) {
            nextFilter.click();
        }
    },
    
    swipeRight() {
        // Navigate to previous day
        const activeFilter = document.querySelector('.filter-btn.active');
        const prevFilter = activeFilter?.previousElementSibling;
        if (prevFilter && prevFilter.classList.contains('filter-btn')) {
            prevFilter.click();
        }
    }
};

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded - attaching event listeners');
    
    
    // Load feeding times if on homepage
    loadFeedingTimes();
    
    // Setup Near Me functionality
    setupNearMe();
    
    // Setup filters if they exist
    setupFilters();
    
    // Setup touch gestures for mobile
    TouchManager.init();
    
    // Setup search functionality
    setupSearch();
    
    // Setup sticky navigation
    setupStickyNavigation();
    
    // Setup smooth scrolling
    setupSmoothScroll();
    
    // Set active navigation
    setActiveNav();
    
    // Setup mobile menu close
    setupMobileMenuClose();
    
    // Setup scroll animations
    setupScrollAnimations();
    
    // Format phone numbers
    formatPhoneNumbers();
    
    // Add form submit handlers
    const volunteerForm = document.getElementById('volunteerForm');
    if (volunteerForm) {
        // Old form handler - disabled for new API-based approach
        // volunteerForm.addEventListener('submit', handleVolunteerSubmit);
    }
    
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        // Old form handler - disabled for new API-based approach
        // contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    // Add hover effects to donation cards
    const donationCards = document.querySelectorAll('.donation-card');
    donationCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px)';
        });
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
    
    // Copy bank details to clipboard functionality
    const bankDetails = document.querySelectorAll('.detail-row .value');
    bankDetails.forEach(detail => {
        detail.style.cursor = 'pointer';
        detail.title = 'Click to copy';
        detail.addEventListener('click', function() {
            const text = this.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const original = this.textContent;
                this.textContent = 'Copied!';
                this.style.color = '#27AE60';
                setTimeout(() => {
                    this.textContent = original;
                    this.style.color = '';
                }, 2000);
            });
        });
    });

    // Debug logging for development
    console.log('🔍 Script initialized successfully');
});

// FAQ Accordion functionality
function toggleFAQ(button) {
    const faqItem = button.parentElement;
    const answer = faqItem.querySelector('.faq-answer');
    const isActive = answer.classList.contains('active');
    
    // Close all other FAQs
    document.querySelectorAll('.faq-answer.active').forEach(activeAnswer => {
        if (activeAnswer !== answer) {
            activeAnswer.classList.remove('active');
            activeAnswer.previousElementSibling.classList.remove('active');
        }
    });
    
    // Toggle current FAQ
    if (isActive) {
        answer.classList.remove('active');
        button.classList.remove('active');
    } else {
        answer.classList.add('active');
        button.classList.add('active');
    }
}

// Sticky navigation with backdrop blur on scroll
function setupStickyNavigation() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    let lastScrollY = window.scrollY;
    let ticking = false;
    
    function updateNavbar() {
        const scrollY = window.scrollY;
        
        if (scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScrollY = scrollY;
        ticking = false;
    }
    
    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateNavbar);
            ticking = true;
        }
    }
    
    window.addEventListener('scroll', requestTick, { passive: true });
}

// Modal Functions for More Info and Calendar
window.openInfoModal = function(eventId) {
    const eventData = window.eventDataStore[eventId];
    if (!eventData) return;
    
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('info-modal');
    if (!modal) {
        const modalHTML = `
            <div id="info-modal" class="modal-backdrop">
                <div class="modal-content">
                    <button class="modal-close" onclick="closeInfoModal()">&times;</button>
                    <h2 id="info-modal-title"></h2>
                    <div id="info-modal-body"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('info-modal');
    }
    
    // Populate modal content
    const title = document.getElementById('info-modal-title');
    const body = document.getElementById('info-modal-body');
    
    // Create Google Maps link
    let mapsUrl = '#';
    if (eventData.lat && eventData.lng) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${eventData.lat},${eventData.lng}`;
    } else if (eventData.Postcode) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventData.Postcode + ' UK')}`;
    }
    
    title.textContent = eventData.Name || eventData['Address 1'];
    body.innerHTML = `
        <div class="modal-info-section">
            <h3>Location Details</h3>
            <p><strong>Address:</strong> ${eventData['Address 1']}, ${eventData.Postcode || ''}</p>
            <p><strong>Town:</strong> ${eventData.Town}</p>
            <p><strong>Type:</strong> ${eventData.Type}</p>
        </div>
        
        <div class="modal-info-section">
            <h3>Schedule</h3>
            <p><strong>Day:</strong> Every ${eventData.Day}</p>
            <p><strong>Time:</strong> ${eventData.StartTime} - ${eventData.EndTime}</p>
        </div>
        
        ${eventData.MoreInfo ? `
        <div class="modal-info-section">
            <h3>Additional Information</h3>
            <p>${eventData.MoreInfo}</p>
        </div>
        ` : ''}
        
        ${eventData.Notes ? `
        <div class="modal-info-section">
            <h3>Important Notes</h3>
            <p class="modal-notes">${eventData.Notes}</p>
        </div>
        ` : ''}
        
        <div class="modal-actions">
            <button class="btn btn-primary" onclick="window.open('${mapsUrl}', '_blank')">
                <i class="fas fa-map-marker-alt"></i> View on Map
            </button>
            ${eventData['Enable Calendar'] === 'Yes' ? `
                <button class="btn btn-success" onclick="openCalendarModalForEvent('${eventId}')">
                    <i class="fas fa-calendar-plus"></i> Add to Calendar
                </button>
            ` : ''}
        </div>
    `;
    
    // Show modal
    modal.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
}

window.closeInfoModal = function() {
    const modal = document.getElementById('info-modal');
    if (modal) {
        modal.classList.remove('modal-visible');
        document.body.style.overflow = '';
    }
}

window.openCalendarModalForEvent = function(eventId) {
    const eventData = window.eventDataStore[eventId];
    if (!eventData) return;
    
    // Close info modal if open
    closeInfoModal();
    
    // Use existing calendar modal or create new one
    let modal = document.getElementById('calendar-modal-backdrop');
    if (!modal) {
        const modalHTML = `
            <div id="calendar-modal-backdrop" class="modal-backdrop">
                <div class="modal-content calendar-modal">
                    <button id="calendar-modal-close" class="modal-close">&times;</button>
                    <h2 id="calendar-modal-title">Add to Calendar</h2>
                    <div id="calendar-modal-event-details"></div>
                    <div class="calendar-options">
                        <button id="calendar-option-google" class="calendar-option">
                            <i class="fab fa-google"></i>
                            <span>Google Calendar</span>
                        </button>
                        <button id="calendar-option-ics" class="calendar-option">
                            <i class="fas fa-calendar-alt"></i>
                            <span>Download ICS File</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('calendar-modal-backdrop');
        
        // Add event listeners
        document.getElementById('calendar-modal-close').addEventListener('click', function(e) {
            e.preventDefault();
            closeCalendarModal();
        });
        document.getElementById('calendar-option-google').addEventListener('click', function(e) {
            e.preventDefault();
            if (window.currentCalendarEvent) {
                console.log('📅 Google Calendar clicked with data:', window.currentCalendarEvent);
                window.addToGoogleCalendar(window.currentCalendarEvent);
                closeCalendarModal();
            } else {
                console.error('❌ No current calendar event data');
            }
        });
        document.getElementById('calendar-option-ics').addEventListener('click', function(e) {
            e.preventDefault();
            if (window.currentCalendarEvent) {
                console.log('💾 ICS Download clicked with data:', window.currentCalendarEvent);
                window.downloadICS(window.currentCalendarEvent);
                closeCalendarModal();
            } else {
                console.error('❌ No current calendar event data');
            }
        });
    }
    
    // Store current event data
    window.currentCalendarEvent = eventData;
    
    // Update modal content
    const title = document.getElementById('calendar-modal-title');
    const details = document.getElementById('calendar-modal-event-details');
    
    title.textContent = `Add "${eventData.Name || eventData.Town + ' - ' + eventData.Type}" to Calendar`;
    details.innerHTML = `
        <strong>${eventData.Day}s at ${eventData.StartTime} - ${eventData.EndTime}</strong><br>
        ${eventData.Name ? eventData.Name + '<br>' : ''}
        ${eventData['Address 1']}${eventData.Postcode ? ', ' + eventData.Postcode : ''}<br>
        ${eventData.Town}
    `;
    
    // Show modal
    modal.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
}

function closeCalendarModal() {
    const modal = document.getElementById('calendar-modal-backdrop');
    if (modal) {
        modal.classList.remove('modal-visible');
        document.body.style.overflow = '';
        window.currentCalendarEvent = null;
    }
}

// Add escape key listener for modals
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeInfoModal();
        closeCalendarModal();
    }
});

// Click outside modal to close
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-backdrop')) {
        closeInfoModal();
        closeCalendarModal();
    }
});

// Calendar Integration Functions

function parseTimeToDate(dayName, startTimeStr, endTimeStr) {
    console.log('🕐 Parsing time:', { dayName, startTimeStr, endTimeStr });
    
    // Get next occurrence of the specified day
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const todayDay = today.getDay();
    const targetDay = daysOfWeek.indexOf(dayName);
    
    let daysUntilTarget = targetDay - todayDay;
    if (daysUntilTarget <= 0) daysUntilTarget += 7;
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    
    // Simply use the provided StartTime and EndTime directly
    // They should already be in HH:MM format from the CSV
    const startTime = startTimeStr ? startTimeStr.replace(':', '') : '1900';
    const endTime = endTimeStr ? endTimeStr.replace(':', '') : '2000';
    
    const result = {
        startDate: `${targetDate.getFullYear()}${(targetDate.getMonth() + 1).toString().padStart(2, '0')}${targetDate.getDate().toString().padStart(2, '0')}`,
        startTime: startTime,
        endTime: endTime
    };
    
    console.log('✅ Parsed time result:', result);
    return result;
}

window.addToGoogleCalendar = function(item, event) {
    console.log('🗓️ Google Calendar function called with:', item);
    if (event) event.preventDefault();
    
    const title = `Homeless Aid UK - ${item.Name || item.Type + ' - ' + item.Town}`;
    const details = `${item.Name ? item.Name + '\n' : ''}${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}${item.Notes ? '\n\nNotes: ' + item.Notes : ''}${item.MoreInfo ? '\n\n' + item.MoreInfo : ''}`;
    const location = `${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}, ${item.Town}, UK`;
    
    const dates = parseTimeToDate(item.Day, item.StartTime, item.EndTime);
    console.log('📅 Google - parsed dates:', dates);
    
    const dateStr = `${dates.startDate}T${dates.startTime}00/${dates.startDate}T${dates.endTime}00`;
    
    console.log('📅 Google - formatted times:', { 
        dateStr, 
        originalStartTime: item.StartTime,
        originalEndTime: item.EndTime 
    });
    
    const googleUrl = `https://calendar.google.com/calendar/render?` +
        `action=TEMPLATE` +
        `&text=${encodeURIComponent(title)}` +
        `&dates=${dateStr}` +
        `&details=${encodeURIComponent(details)}` +
        `&location=${encodeURIComponent(location)}` +
        `&recur=${encodeURIComponent('RRULE:FREQ=WEEKLY')}`;
    
    console.log('🔗 Opening Google Calendar URL:', googleUrl);
    window.open(googleUrl, '_blank');
}

// Outlook Calendar function - DISABLED due to timezone issues
// Can be re-enabled if Outlook API issues are resolved
/*
window.addToOutlookCalendar = function(item, event) {
    console.log('📧 Outlook Calendar function called with:', item);
    if (event) event.preventDefault();
    
    const title = `Homeless Aid UK - ${item.Type} - ${item.Town}`;
    const details = `${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}${item.Notes ? '\n\nNotes: ' + item.Notes : ''}`;
    const location = `${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}, ${item.Town}, UK`;
    
    const dates = parseTimeToDate(item.Day, item.Time);
    console.log('📅 Outlook - parsed dates:', dates);
    
    // Create proper Date objects in local timezone
    const startYear = parseInt(dates.startDate.substring(0, 4));
    const startMonth = parseInt(dates.startDate.substring(4, 6)) - 1; // Month is 0-indexed
    const startDay = parseInt(dates.startDate.substring(6, 8));
    const startHour = parseInt(dates.startTime.substring(0, 2));
    const startMinute = parseInt(dates.startTime.substring(2, 4));
    
    const endYear = startYear;
    const endMonth = startMonth;
    const endDay = startDay;
    const endHour = parseInt(dates.endTime.substring(0, 2));
    const endMinute = parseInt(dates.endTime.substring(2, 4));
    
    const startDate = new Date(startYear, startMonth, startDay, startHour, startMinute);
    const endDate = new Date(endYear, endMonth, endDay, endHour, endMinute);
    
    console.log('📅 Outlook - Date objects:', { 
        startDate: startDate.toString(), 
        endDate: endDate.toString(),
        originalTime: item.Time 
    });
    
    // Format as local time string without timezone indicator (YYYYMMDDTHHMMSS)
    // This should be interpreted as local time by Outlook
    const formatLocalDateTime = (dateObj) => {
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        const hour = dateObj.getHours().toString().padStart(2, '0');
        const minute = dateObj.getMinutes().toString().padStart(2, '0');
        const second = '00';
        return `${year}${month}${day}T${hour}${minute}${second}`;
    };
    
    const startDateTime = formatLocalDateTime(startDate);
    const endDateTime = formatLocalDateTime(endDate);
    
    console.log('📅 Outlook - Local formatted times:', { 
        startDateTime, 
        endDateTime,
        rawStartTime: `${startHour}:${startMinute.toString().padStart(2, '0')}`,
        rawEndTime: `${endHour}:${endMinute.toString().padStart(2, '0')}`,
        localStartDate: startDate.toLocaleString(),
        localEndDate: endDate.toLocaleString()
    });
    
    // Try Office 365 calendar URL format which is more reliable
    // Using outlook.office.com instead of outlook.live.com
    const outlookUrl = `https://outlook.office.com/calendar/0/deeplink/compose?` +
        `subject=${encodeURIComponent(title)}` +
        `&body=${encodeURIComponent(details)}` +
        `&location=${encodeURIComponent(location)}` +
        `&startdt=${startDateTime}` +
        `&enddt=${endDateTime}` +
        `&allday=false`;
    
    // If Office 365 doesn't work, try the live.com version as fallback
    const outlookLiveUrl = `https://outlook.live.com/calendar/0/deeplink/compose?` +
        `subject=${encodeURIComponent(title)}` +
        `&body=${encodeURIComponent(details)}` +
        `&location=${encodeURIComponent(location)}` +
        `&startdt=${startDateTime}` +
        `&enddt=${endDateTime}` +
        `&allday=false`;
    
    console.log('🔗 Opening Outlook Calendar URLs:');
    console.log('Office 365:', outlookUrl);
    console.log('Live.com backup:', outlookLiveUrl);
    
    // Try the Office 365 version first
    const newWindow = window.open(outlookUrl, '_blank');
    
    // If the window didn't open or user wants to try alternative
    if (!newWindow) {
        console.log('⚠️ Primary URL failed, trying backup URL');
        window.open(outlookLiveUrl, '_blank');
    }
}
*/

window.downloadICS = function(item, event) {
    console.log('⬇️ Download ICS function called with:', item);
    if (event) event.preventDefault();
    
    const title = `Homeless Aid UK - ${item.Name || item.Type + ' - ' + item.Town}`;
    const details = `${item.Name ? item.Name + '\n' : ''}${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}${item.Notes ? '\n\nNotes: ' + item.Notes : ''}${item.MoreInfo ? '\n\n' + item.MoreInfo : ''}`;
    const location = `${item['Address 1']}${item.Postcode ? ', ' + item.Postcode : ''}, ${item.Town}, UK`;
    
    const dates = parseTimeToDate(item.Day, item.StartTime, item.EndTime);
    console.log('📅 ICS - parsed dates:', dates);
    
    const startDateTime = `${dates.startDate}T${dates.startTime}00`;
    const endDateTime = `${dates.startDate}T${dates.endTime}00`;
    
    console.log('📅 ICS - formatted times:', { 
        startDateTime, 
        endDateTime,
        originalStartTime: item.StartTime,
        originalEndTime: item.EndTime 
    });
    
    const icsContent = 
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Homeless Aid UK//Food Service//EN
BEGIN:VEVENT
UID:${Date.now()}@homelessaid.co.uk
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
DTSTART:${startDateTime}
DTEND:${endDateTime}
RRULE:FREQ=WEEKLY
SUMMARY:${title}
DESCRIPTION:${details.replace(/\n/g, '\\n')}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;

    console.log('📄 Generated ICS content:', icsContent);
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homeless-aid-uk-${item.Town.toLowerCase().replace(/\s+/g, '-')}-${item.Day.toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✅ ICS file downloaded successfully');
}

// Service Worker for offline functionality (optional enhancement)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Only register service worker if one exists
        fetch('/sw.js').then(response => {
            if (response.ok) {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => console.log('SW registered'))
                    .catch(err => console.log('SW registration failed'));
            }
        }).catch(() => {
            // Service worker file doesn't exist, skip registration
        });
    });
}