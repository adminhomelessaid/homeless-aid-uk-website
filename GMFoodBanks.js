class GMFoodBanks {
    constructor() {
        this.foodBanks = [];
        this.filteredFoodBanks = [];
        this.userLocation = null;
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.filters = {
            search: '',
            borough: 'all',
            day: 'all',
            service: 'all',
            quickFilter: 'all',
            sortBy: 'distance'
        };
        this.uniqueBoroughs = new Set();
        this.isLocationEnabled = false;
        this.locationRequested = false;
        
        this.init();
    }

    init() {
        this.loadFoodBanks();
        this.setupEventListeners();
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000); // Update every minute
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', this.debounce((e) => {
            this.filters.search = e.target.value.toLowerCase();
            clearSearch.style.display = e.target.value ? 'flex' : 'none';
            this.applyFilters();
        }, 300));

        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            this.filters.search = '';
            clearSearch.style.display = 'none';
            this.applyFilters();
        });

        // Location button
        document.getElementById('locationBtn').addEventListener('click', () => {
            this.requestLocation();
        });

        // Quick filters
        document.querySelectorAll('.quick-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.quick-filter').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filters.quickFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });

        // Advanced filters
        document.getElementById('boroughFilter').addEventListener('change', (e) => {
            this.filters.borough = e.target.value;
            this.applyFilters();
        });

        document.getElementById('dayFilter').addEventListener('change', (e) => {
            this.filters.day = e.target.value;
            this.applyFilters();
        });

        document.getElementById('serviceFilter').addEventListener('change', (e) => {
            this.filters.service = e.target.value;
            this.applyFilters();
        });

        document.getElementById('sortBy').addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.applyFilters();
        });

        // Filters toggle
        document.getElementById('filtersToggle').addEventListener('click', () => {
            const advancedFilters = document.getElementById('advancedFilters');
            const toggleIcon = document.querySelector('#filtersToggle i');
            
            if (advancedFilters.style.display === 'none' || !advancedFilters.style.display) {
                advancedFilters.style.display = 'flex';
                toggleIcon.classList.remove('fa-chevron-down');
                toggleIcon.classList.add('fa-chevron-up');
            } else {
                advancedFilters.style.display = 'none';
                toggleIcon.classList.remove('fa-chevron-up');
                toggleIcon.classList.add('fa-chevron-down');
            }
        });

        // Modal functionality
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modalOverlay')) {
                this.closeModal();
            }
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal();
        });

        // Load more button
        document.getElementById('loadMoreBtn').addEventListener('click', () => {
            this.loadMoreResults();
        });

        // Keyboard accessibility
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    async loadFoodBanks() {
        try {
            document.getElementById('loadingContainer').style.display = 'flex';
            
            const response = await fetch('greater_manchester_foodbanks.csv');
            const csvText = await response.text();
            
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    this.processFoodBanks(results.data);
                },
                error: (error) => {
                    console.error('Error parsing CSV:', error);
                    this.showError('Failed to load food bank data');
                }
            });
        } catch (error) {
            console.error('Error loading CSV:', error);
            this.showError('Failed to load food bank data');
        }
    }

    processFoodBanks(data) {
        this.foodBanks = data.map((bank, index) => {
            // Clean and process data
            const processedBank = {
                id: index,
                name: this.cleanText(bank.Name),
                borough: this.cleanText(bank.Borough),
                area: this.cleanText(bank.Area),
                fullAddress: this.cleanText(bank.Full_Address),
                postcode: this.cleanText(bank.Postcode),
                openingTimes: this.cleanText(bank.Opening_Times),
                phone: this.formatPhone(bank.Phone),
                email: this.cleanText(bank.Email),
                website: this.cleanText(bank.Website),
                requirements: this.cleanText(bank.Requirements),
                cost: this.cleanText(bank.Cost),
                services: this.cleanText(bank.Services),
                contactPerson: this.cleanText(bank.Contact_Person),
                notes: this.cleanText(bank.Notes),
                
                // Day availability
                monday: bank.Monday === 'Y',
                tuesday: bank.Tuesday === 'Y',
                wednesday: bank.Wednesday === 'Y',
                thursday: bank.Thursday === 'Y',
                friday: bank.Friday === 'Y',
                saturday: bank.Saturday === 'Y',
                sunday: bank.Sunday === 'Y',
                
                // Time information
                openingTime: this.parseTime(bank.Opening_Time),
                closingTime: this.parseTime(bank.Closing_Time),
                timeNotes: this.cleanText(bank.Time_Notes),
                
                // Services flags
                serviceFoodBank: bank.Service_FoodBank === 'Y',
                serviceCommunityMeals: bank.Service_CommunityMeals === 'Y',
                serviceDelivery: bank.Service_Delivery === 'Y',
                serviceClothing: bank.Service_Clothing === 'Y',
                serviceUtilities: bank.Service_Utilities === 'Y',
                serviceFurniture: bank.Service_Furniture === 'Y',
                
                // Location and access
                accessType: this.cleanText(bank.Access_Type),
                latitude: parseFloat(bank.Latitude),
                longitude: parseFloat(bank.Longitude),
                hasCompleteInfo: bank.Has_Complete_Info === 'Y',
                lastUpdated: this.cleanText(bank.Last_Updated),
                coordinateSource: this.cleanText(bank.Coordinate_Source),
                
                // Calculated fields
                distance: null,
                status: null,
                nextOpening: null
            };

            // Add borough to unique list
            if (processedBank.borough) {
                this.uniqueBoroughs.add(processedBank.borough);
            }

            return processedBank;
        }).filter(bank => bank.name && bank.latitude && bank.longitude);

        this.populateBoroughFilter();
        this.calculateStatuses();
        this.applyFilters();
        
        document.getElementById('loadingContainer').style.display = 'none';
        document.getElementById('totalFoodbanks').textContent = this.foodBanks.length;
        document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString();
    }

    cleanText(text) {
        if (!text || text === 'null' || text === 'undefined') return '';
        return text.toString().trim();
    }

    formatPhone(phone) {
        if (!phone || phone === 'null' || phone === 'undefined') return '';
        
        // Remove any non-digit characters except + and spaces
        let cleaned = phone.toString().replace(/[^\d+\s]/g, '');
        
        // Basic UK phone number formatting
        if (cleaned.length === 11 && cleaned.startsWith('0')) {
            return cleaned.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
        }
        
        return cleaned;
    }

    parseTime(timeStr) {
        if (!timeStr || timeStr === 'null' || timeStr === 'undefined') return null;
        
        const time = timeStr.toString().trim();
        if (time.match(/^\d{1,2}:\d{2}$/)) {
            return time;
        }
        
        return null;
    }

    populateBoroughFilter() {
        const boroughFilter = document.getElementById('boroughFilter');
        const sortedBoroughs = Array.from(this.uniqueBoroughs).sort();
        
        // Clear existing options (except "All Boroughs")
        while (boroughFilter.children.length > 1) {
            boroughFilter.removeChild(boroughFilter.lastChild);
        }
        
        sortedBoroughs.forEach(borough => {
            if (borough) {
                const option = document.createElement('option');
                option.value = borough.toLowerCase();
                option.textContent = borough;
                boroughFilter.appendChild(option);
            }
        });
    }

    calculateStatuses() {
        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

        this.foodBanks.forEach(bank => {
            const status = this.getFoodBankStatus(bank, now, currentDay, currentTime);
            bank.status = status.status;
            bank.nextOpening = status.nextOpening;
        });

        // Update open now count
        const openNow = this.foodBanks.filter(bank => bank.status === 'open').length;
        document.getElementById('openNow').textContent = openNow;
    }

    getFoodBankStatus(bank, now, currentDay, currentTime) {
        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = dayMap[currentDay];
        
        // Check if open today
        const isOpenToday = bank[today];
        
        if (!isOpenToday || !bank.openingTime || !bank.closingTime) {
            return {
                status: 'closed',
                nextOpening: this.findNextOpening(bank, now)
            };
        }

        const [openHour, openMin] = bank.openingTime.split(':').map(Number);
        const [closeHour, closeMin] = bank.closingTime.split(':').map(Number);
        
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;
        
        // Check if currently open
        if (currentTime >= openTime && currentTime < closeTime) {
            return {
                status: 'open',
                nextOpening: null
            };
        }
        
        // Check if opens soon (within 2 hours)
        const timeUntilOpen = openTime - currentTime;
        if (timeUntilOpen > 0 && timeUntilOpen <= 120) {
            return {
                status: 'opening-soon',
                nextOpening: this.formatTimeUntil(timeUntilOpen)
            };
        }
        
        return {
            status: 'closed',
            nextOpening: this.findNextOpening(bank, now)
        };
    }

    findNextOpening(bank, now) {
        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(now.getDate() + i);
            const dayName = dayMap[checkDate.getDay()];
            
            if (bank[dayName] && bank.openingTime) {
                if (i === 0) {
                    // Today - check if opening time has passed
                    const [openHour, openMin] = bank.openingTime.split(':').map(Number);
                    const openTime = openHour * 60 + openMin;
                    const currentTime = now.getHours() * 60 + now.getMinutes();
                    
                    if (currentTime < openTime) {
                        return `Today at ${bank.openingTime}`;
                    }
                } else {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    return `${dayNames[checkDate.getDay()]} at ${bank.openingTime}`;
                }
            }
        }
        
        return 'Check opening times';
    }

    formatTimeUntil(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
            return `Opens in ${hours}h ${mins}m`;
        } else {
            return `Opens in ${mins}m`;
        }
    }

    updateDateTime() {
        this.calculateStatuses();
        if (this.filteredFoodBanks.length > 0) {
            this.renderFoodBanks();
        }
    }

    requestLocation() {
        if (!navigator.geolocation) {
            this.showLocationError('Geolocation is not supported by this browser');
            return;
        }

        const locationBtn = document.getElementById('locationBtn');
        const locationText = locationBtn.querySelector('.location-text');
        const locationIcon = locationBtn.querySelector('i');

        locationBtn.disabled = true;
        locationIcon.className = 'fas fa-spinner fa-spin';
        locationText.textContent = 'Getting location...';

        this.locationRequested = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                this.isLocationEnabled = true;
                
                locationIcon.className = 'fas fa-map-marker-alt';
                locationText.textContent = 'Location Found';
                locationBtn.classList.add('location-active');
                locationBtn.disabled = false;
                
                this.calculateDistances();
                this.filters.sortBy = 'distance';
                document.getElementById('sortBy').value = 'distance';
                this.applyFilters();
                
                document.getElementById('locationStatus').textContent = '(sorted by distance)';
            },
            (error) => {
                this.showLocationError(this.getLocationErrorMessage(error));
                locationIcon.className = 'fas fa-location-arrow';
                locationText.textContent = 'Near Me';
                locationBtn.disabled = false;
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    }

    getLocationErrorMessage(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return 'Location access denied. Please enable location services.';
            case error.POSITION_UNAVAILABLE:
                return 'Location information is unavailable.';
            case error.TIMEOUT:
                return 'Location request timed out.';
            default:
                return 'An unknown location error occurred.';
        }
    }

    showLocationError(message) {
        const locationStatus = document.getElementById('locationStatus');
        locationStatus.textContent = `(${message})`;
        locationStatus.style.color = 'var(--error-color)';
        
        setTimeout(() => {
            locationStatus.textContent = '';
            locationStatus.style.color = '';
        }, 5000);
    }

    calculateDistances() {
        if (!this.userLocation) return;

        this.foodBanks.forEach(bank => {
            bank.distance = this.calculateHaversineDistance(
                this.userLocation.lat,
                this.userLocation.lng,
                bank.latitude,
                bank.longitude
            );
        });

        // Update near you count (within 5 miles)
        const nearYou = this.foodBanks.filter(bank => bank.distance && bank.distance <= 5).length;
        document.getElementById('nearYou').textContent = nearYou;
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    applyFilters() {
        let filtered = [...this.foodBanks];

        // Apply search filter
        if (this.filters.search) {
            filtered = filtered.filter(bank =>
                bank.name.toLowerCase().includes(this.filters.search) ||
                bank.fullAddress.toLowerCase().includes(this.filters.search) ||
                bank.postcode.toLowerCase().includes(this.filters.search) ||
                bank.borough.toLowerCase().includes(this.filters.search) ||
                bank.area.toLowerCase().includes(this.filters.search)
            );
        }

        // Apply borough filter
        if (this.filters.borough !== 'all') {
            filtered = filtered.filter(bank =>
                bank.borough.toLowerCase() === this.filters.borough
            );
        }

        // Apply day filter
        if (this.filters.day !== 'all') {
            filtered = this.applyDayFilter(filtered, this.filters.day);
        }

        // Apply service filter
        if (this.filters.service !== 'all') {
            filtered = this.applyServiceFilter(filtered, this.filters.service);
        }

        // Apply quick filters
        filtered = this.applyQuickFilter(filtered, this.filters.quickFilter);

        // Apply sorting
        filtered = this.applySorting(filtered, this.filters.sortBy);

        this.filteredFoodBanks = filtered;
        this.currentPage = 1;
        this.updateResultsCount();
        this.renderFoodBanks();
    }

    applyDayFilter(banks, dayFilter) {
        const now = new Date();
        const today = now.getDay();
        const tomorrow = (today + 1) % 7;

        switch (dayFilter) {
            case 'today':
                const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const todayName = dayMap[today];
                return banks.filter(bank => bank[todayName]);
                
            case 'tomorrow':
                const dayMapTomorrow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const tomorrowName = dayMapTomorrow[tomorrow];
                return banks.filter(bank => bank[tomorrowName]);
                
            case 'weekday':
                return banks.filter(bank =>
                    bank.monday || bank.tuesday || bank.wednesday || bank.thursday || bank.friday
                );
                
            case 'weekend':
                return banks.filter(bank => bank.saturday || bank.sunday);
                
            default:
                return banks;
        }
    }

    applyServiceFilter(banks, serviceFilter) {
        const serviceMap = {
            'foodbank': 'serviceFoodBank',
            'meals': 'serviceCommunityMeals',
            'delivery': 'serviceDelivery',
            'clothing': 'serviceClothing',
            'furniture': 'serviceFurniture',
            'utilities': 'serviceUtilities'
        };

        const serviceField = serviceMap[serviceFilter];
        if (!serviceField) return banks;

        return banks.filter(bank => bank[serviceField]);
    }

    applyQuickFilter(banks, quickFilter) {
        switch (quickFilter) {
            case 'open-now':
                return banks.filter(bank => bank.status === 'open');
                
            case 'free-only':
                return banks.filter(bank => 
                    bank.cost && bank.cost.toLowerCase().includes('free')
                );
                
            case 'walk-in':
                return banks.filter(bank => 
                    !bank.accessType || 
                    bank.accessType.toLowerCase().includes('walk') ||
                    bank.accessType.toLowerCase() === 'both' ||
                    bank.accessType.toLowerCase() === 'unknown'
                );
                
            case 'delivery':
                return banks.filter(bank => bank.serviceDelivery);
                
            default:
                return banks;
        }
    }

    applySorting(banks, sortBy) {
        switch (sortBy) {
            case 'distance':
                if (this.isLocationEnabled) {
                    return banks.sort((a, b) => (a.distance || 999) - (b.distance || 999));
                }
                return banks.sort((a, b) => a.name.localeCompare(b.name));
                
            case 'name':
                return banks.sort((a, b) => a.name.localeCompare(b.name));
                
            case 'opening-soon':
                const statusOrder = { 'open': 1, 'opening-soon': 2, 'closed': 3 };
                return banks.sort((a, b) => {
                    const aOrder = statusOrder[a.status] || 4;
                    const bOrder = statusOrder[b.status] || 4;
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return a.name.localeCompare(b.name);
                });
                
            case 'borough':
                return banks.sort((a, b) => {
                    if (a.borough !== b.borough) {
                        return a.borough.localeCompare(b.borough);
                    }
                    return a.name.localeCompare(b.name);
                });
                
            default:
                return banks;
        }
    }

    updateResultsCount() {
        const count = this.filteredFoodBanks.length;
        document.getElementById('resultsCount').textContent = count;
        
        const noResults = document.getElementById('noResults');
        if (count === 0) {
            noResults.style.display = 'block';
        } else {
            noResults.style.display = 'none';
        }
    }

    renderFoodBanks() {
        const grid = document.getElementById('foodbanksGrid');
        const endIndex = this.currentPage * this.itemsPerPage;
        const banksToShow = this.filteredFoodBanks.slice(0, endIndex);
        
        grid.innerHTML = '';
        banksToShow.forEach(bank => {
            const card = this.createFoodBankCard(bank);
            grid.appendChild(card);
        });

        // Show/hide load more button
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (endIndex < this.filteredFoodBanks.length) {
            loadMoreContainer.style.display = 'block';
        } else {
            loadMoreContainer.style.display = 'none';
        }
    }

    createFoodBankCard(bank) {
        const card = document.createElement('div');
        card.className = 'foodbank-card';
        card.setAttribute('data-id', bank.id);

        const statusClass = bank.status || 'closed';
        const statusText = this.getStatusText(bank);
        const distanceText = bank.distance ? `${bank.distance.toFixed(1)} miles` : '';
        
        card.innerHTML = `
            <div class="card-header">
                <div class="status-badge ${statusClass}">${statusText}</div>
                ${distanceText ? `<div class="distance">${distanceText}</div>` : ''}
            </div>
            
            <div class="card-content">
                <h3 class="foodbank-name">${bank.name}</h3>
                <div class="foodbank-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${bank.borough}${bank.area ? `, ${bank.area}` : ''}</span>
                </div>
                
                <div class="card-details">
                    <div class="detail-item">
                        <i class="fas fa-pound-sign"></i>
                        <span>${bank.cost || 'Contact for details'}</span>
                    </div>
                    
                    <div class="detail-item">
                        <i class="fas fa-door-open"></i>
                        <span>${this.formatAccessType(bank.accessType)}</span>
                    </div>
                </div>
                
                <div class="services-icons">
                    ${this.renderServiceIcons(bank)}
                </div>
                
                <div class="card-address">
                    ${bank.fullAddress}${bank.postcode ? `, ${bank.postcode}` : ''}
                </div>
                
                ${bank.nextOpening ? `<div class="next-opening">${bank.nextOpening}</div>` : ''}
            </div>
            
            <div class="card-actions">
                <button class="btn btn-outline directions-btn" onclick="gmFoodBanks.openDirections(${bank.id})">
                    <i class="fas fa-directions"></i>
                    Directions
                </button>
                <button class="btn btn-primary info-btn" onclick="gmFoodBanks.showDetails(${bank.id})">
                    <i class="fas fa-info-circle"></i>
                    More Info
                </button>
            </div>
        `;

        return card;
    }

    getStatusText(bank) {
        switch (bank.status) {
            case 'open':
                return 'Open Now';
            case 'opening-soon':
                return 'Opens Soon';
            case 'closed':
            default:
                return 'Closed';
        }
    }

    formatAccessType(accessType) {
        if (!accessType || accessType.toLowerCase() === 'unknown') {
            return 'Contact for access';
        }
        
        switch (accessType.toLowerCase()) {
            case 'walk-in':
                return 'Walk-in';
            case 'referral':
                return 'Referral Required';
            case 'both':
                return 'Walk-in & Referral';
            default:
                return accessType;
        }
    }

    renderServiceIcons(bank) {
        const services = [
            { key: 'serviceFoodBank', icon: 'fas fa-shopping-basket', label: 'Food Bank' },
            { key: 'serviceCommunityMeals', icon: 'fas fa-utensils', label: 'Community Meals' },
            { key: 'serviceDelivery', icon: 'fas fa-truck', label: 'Delivery' },
            { key: 'serviceClothing', icon: 'fas fa-tshirt', label: 'Clothing' },
            { key: 'serviceFurniture', icon: 'fas fa-couch', label: 'Furniture' },
            { key: 'serviceUtilities', icon: 'fas fa-bolt', label: 'Utilities' }
        ];

        return services.map(service => {
            const isActive = bank[service.key];
            return `
                <div class="service-icon ${isActive ? 'active' : 'inactive'}" title="${service.label}">
                    <i class="${service.icon}"></i>
                </div>
            `;
        }).join('');
    }

    loadMoreResults() {
        this.currentPage++;
        this.renderFoodBanks();
    }

    showDetails(bankId) {
        const bank = this.foodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const modal = document.getElementById('modalOverlay');
        const modalBody = document.getElementById('modalBody');
        
        modalBody.innerHTML = this.createDetailedView(bank);
        modal.style.display = 'flex';
        
        // Focus management for accessibility
        document.getElementById('modalClose').focus();
    }

    createDetailedView(bank) {
        const openingHours = this.formatOpeningHours(bank);
        const services = this.formatDetailedServices(bank);
        
        return `
            <div class="modal-header">
                <h2>${bank.name}</h2>
                <div class="status-badge ${bank.status || 'closed'}">
                    ${this.getStatusText(bank)}
                </div>
            </div>
            
            <div class="modal-section">
                <h3><i class="fas fa-map-marker-alt"></i> Location & Contact</h3>
                <p class="modal-address">${bank.fullAddress}${bank.postcode ? `, ${bank.postcode}` : ''}</p>
                
                <div class="contact-details">
                    ${bank.phone ? `
                        <div class="contact-item">
                            <i class="fas fa-phone"></i>
                            <a href="tel:${bank.phone}">${bank.phone}</a>
                        </div>
                    ` : ''}
                    
                    ${bank.email ? `
                        <div class="contact-item">
                            <i class="fas fa-envelope"></i>
                            <a href="mailto:${bank.email}">${bank.email}</a>
                        </div>
                    ` : ''}
                    
                    ${bank.website ? `
                        <div class="contact-item">
                            <i class="fas fa-globe"></i>
                            <a href="${bank.website}" target="_blank" rel="noopener">Visit Website</a>
                        </div>
                    ` : ''}
                </div>
                
                ${bank.distance ? `<p class="distance-info">Distance: ${bank.distance.toFixed(1)} miles from your location</p>` : ''}
            </div>
            
            <div class="modal-section">
                <h3><i class="fas fa-clock"></i> Opening Hours</h3>
                ${openingHours}
                ${bank.timeNotes ? `<p class="time-notes"><strong>Note:</strong> ${bank.timeNotes}</p>` : ''}
            </div>
            
            <div class="modal-section">
                <h3><i class="fas fa-hand-holding-heart"></i> Services</h3>
                ${services}
            </div>
            
            <div class="modal-section">
                <h3><i class="fas fa-info-circle"></i> Access Information</h3>
                <div class="access-info">
                    <div class="info-item">
                        <strong>Cost:</strong> ${bank.cost || 'Contact for details'}
                    </div>
                    <div class="info-item">
                        <strong>Access Type:</strong> ${this.formatAccessType(bank.accessType)}
                    </div>
                    ${bank.requirements ? `
                        <div class="info-item">
                            <strong>Requirements:</strong> ${bank.requirements}
                        </div>
                    ` : ''}
                </div>
            </div>
            
            ${bank.notes ? `
                <div class="modal-section">
                    <h3><i class="fas fa-sticky-note"></i> Additional Information</h3>
                    <p>${bank.notes}</p>
                </div>
            ` : ''}
            
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="gmFoodBanks.openDirections(${bank.id})">
                    <i class="fas fa-directions"></i>
                    Get Directions
                </button>
                ${bank.phone ? `
                    <button class="btn btn-outline" onclick="window.open('tel:${bank.phone}')">
                        <i class="fas fa-phone"></i>
                        Call Now
                    </button>
                ` : ''}
                <button class="btn btn-link" onclick="gmFoodBanks.shareLocation(${bank.id})">
                    <i class="fas fa-share"></i>
                    Share
                </button>
            </div>
        `;
    }

    formatOpeningHours(bank) {
        const days = [
            { name: 'Monday', key: 'monday' },
            { name: 'Tuesday', key: 'tuesday' },
            { name: 'Wednesday', key: 'wednesday' },
            { name: 'Thursday', key: 'thursday' },
            { name: 'Friday', key: 'friday' },
            { name: 'Saturday', key: 'saturday' },
            { name: 'Sunday', key: 'sunday' }
        ];

        const hours = days.map(day => {
            const isOpen = bank[day.key];
            const times = isOpen && bank.openingTime && bank.closingTime 
                ? `${bank.openingTime} - ${bank.closingTime}`
                : 'Closed';
                
            return `
                <div class="hours-row ${isOpen ? 'open' : 'closed'}">
                    <span class="day">${day.name}</span>
                    <span class="times">${times}</span>
                </div>
            `;
        }).join('');

        return `<div class="opening-hours">${hours}</div>`;
    }

    formatDetailedServices(bank) {
        const services = [];
        
        if (bank.serviceFoodBank) services.push('Food Bank');
        if (bank.serviceCommunityMeals) services.push('Community Meals');
        if (bank.serviceDelivery) services.push('Delivery Service');
        if (bank.serviceClothing) services.push('Clothing Support');
        if (bank.serviceFurniture) services.push('Furniture');
        if (bank.serviceUtilities) services.push('Utilities Support');
        
        if (services.length === 0) {
            return '<p>Contact for service details</p>';
        }
        
        return `
            <div class="services-list">
                ${services.map(service => `
                    <div class="service-item">
                        <i class="fas fa-check"></i>
                        <span>${service}</span>
                    </div>
                `).join('')}
            </div>
            ${bank.services ? `<p class="service-description">${bank.services}</p>` : ''}
        `;
    }

    closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
    }

    openDirections(bankId) {
        const bank = this.foodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const destination = encodeURIComponent(`${bank.fullAddress}, ${bank.postcode}`);
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
        
        window.open(googleMapsUrl, '_blank');
        
        // Track event for analytics
        if (typeof gtag === 'function') {
            gtag('event', 'directions_requested', {
                'food_bank_name': bank.name,
                'borough': bank.borough
            });
        }
    }

    shareLocation(bankId) {
        const bank = this.foodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const shareText = `${bank.name} - ${bank.fullAddress}${bank.postcode ? `, ${bank.postcode}` : ''}`;
        const shareUrl = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: bank.name,
                text: shareText,
                url: shareUrl
            });
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
                this.showToast('Location details copied to clipboard');
            });
        }
    }

    showToast(message) {
        // Simple toast implementation
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--primary-color);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.style.opacity = '1', 100);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    clearAllFilters() {
        // Reset all filters
        this.filters = {
            search: '',
            borough: 'all',
            day: 'all',
            service: 'all',
            quickFilter: 'all',
            sortBy: this.isLocationEnabled ? 'distance' : 'name'
        };

        // Reset UI elements
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearch').style.display = 'none';
        document.getElementById('boroughFilter').value = 'all';
        document.getElementById('dayFilter').value = 'all';
        document.getElementById('serviceFilter').value = 'all';
        document.getElementById('sortBy').value = this.filters.sortBy;
        
        document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.quick-filter[data-filter="all"]').classList.add('active');

        // Apply filters
        this.applyFilters();
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Error Loading Data</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
        `;
        
        const container = document.querySelector('.results-section .container');
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Clear all filters function (global for button onclick)
function clearAllFilters() {
    if (window.gmFoodBanks) {
        window.gmFoodBanks.clearAllFilters();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gmFoodBanks = new GMFoodBanks();
});