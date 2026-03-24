class FoodBanksManager {
    constructor() {
        this.currentRegion = localStorage.getItem('foodBanksRegion') || 'greater_manchester';
        this.gmFoodBanks = [];
        this.liverpoolFoodBanks = [];
        this.currentFoodBanks = [];
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
        this.isLoading = false;
        
        this.init();
    }

    trackEvent(eventName, parameters = {}) {
        if (typeof AnalyticsTracker !== 'undefined' && AnalyticsTracker.trackEvent) {
            return AnalyticsTracker.trackEvent(eventName, {
                page: 'food_banks',
                current_region: this.currentRegion,
                ...parameters
            });
        }
        else if (typeof gtag === 'function' && window.CookieConsent && window.CookieConsent.isAllowed && window.CookieConsent.isAllowed('analytics')) {
            console.log(`📊 Food Banks Event: ${eventName}`, parameters);
            gtag('event', eventName, {
                page: 'food_banks',
                current_region: this.currentRegion,
                ...parameters
            });
            return true;
        }
        return false;
    }

    init() {
        this.setupEventListeners();
        this.setupRegionSwitcher();
        this.loadDataForCurrentRegion();
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000);
    }

    setupRegionSwitcher() {
        const regionButtons = document.querySelectorAll('.region-btn');
        
        regionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const region = e.currentTarget.dataset.region;
                if (region !== this.currentRegion) {
                    this.switchRegion(region);
                }
            });
        });

        // Set initial active state
        this.updateRegionUI();
    }

    switchRegion(newRegion) {
        if (this.isLoading) return;

        const oldRegion = this.currentRegion;
        this.currentRegion = newRegion;
        
        localStorage.setItem('foodBanksRegion', newRegion);
        
        this.updateRegionUI();
        this.showLoadingState();
        
        this.trackEvent('region_switched', {
            from_region: oldRegion,
            to_region: newRegion
        });

        setTimeout(() => {
            this.loadDataForCurrentRegion();
        }, 300);
    }

    updateRegionUI() {
        const regionButtons = document.querySelectorAll('.region-btn');
        
        regionButtons.forEach(btn => {
            const region = btn.dataset.region;
            if (region === this.currentRegion) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    showLoadingState() {
        this.isLoading = true;
        document.getElementById('loadingContainer').style.display = 'flex';
        document.getElementById('foodbanksGrid').innerHTML = '';
        document.getElementById('noResults').style.display = 'none';
        document.getElementById('resultsCount').textContent = '0';
    }

    hideLoadingState() {
        this.isLoading = false;
        document.getElementById('loadingContainer').style.display = 'none';
    }

    async loadDataForCurrentRegion() {
        try {
            this.showLoadingState();

            if (this.currentRegion === 'greater_manchester' && this.gmFoodBanks.length === 0) {
                await this.loadGreaterManchesterData();
            } else if (this.currentRegion === 'liverpool' && this.liverpoolFoodBanks.length === 0) {
                await this.loadLiverpoolData();
            }

            this.switchToCurrentRegionData();
            this.hideLoadingState();
            
        } catch (error) {
            console.error('Error loading region data:', error);
            this.showError('Failed to load food bank data');
            this.hideLoadingState();
        }
    }

    async loadGreaterManchesterData() {
        const response = await fetch('greater_manchester_foodbanks.csv');
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    this.gmFoodBanks = this.processFoodBanks(results.data);
                    resolve();
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    async loadLiverpoolData() {
        const response = await fetch('liverpool_foodbanks.csv');
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    this.liverpoolFoodBanks = this.processFoodBanks(results.data);
                    resolve();
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    switchToCurrentRegionData() {
        this.currentFoodBanks = this.currentRegion === 'greater_manchester' 
            ? this.gmFoodBanks 
            : this.liverpoolFoodBanks;

        this.populateBoroughFilter();
        this.calculateStatuses();
        this.applyFilters();
        
        document.getElementById('totalFoodbanks').textContent = this.currentFoodBanks.length;
        document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString();

        if (this.userLocation) {
            this.calculateDistances();
        }

        this.trackEvent('region_data_loaded', {
            region: this.currentRegion,
            total_food_banks: this.currentFoodBanks.length,
            has_location: !!this.userLocation
        });
    }

    processFoodBanks(data) {
        const processedBanks = data.map((bank, index) => {
            const processedBank = {
                id: `${this.currentRegion}_${index}`,
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
                
                // Day availability - handle both Y/N and Yes/No formats
                monday: this.parseBoolean(bank.Monday),
                tuesday: this.parseBoolean(bank.Tuesday),
                wednesday: this.parseBoolean(bank.Wednesday),
                thursday: this.parseBoolean(bank.Thursday),
                friday: this.parseBoolean(bank.Friday),
                saturday: this.parseBoolean(bank.Saturday),
                sunday: this.parseBoolean(bank.Sunday),
                
                openingTime: this.parseTime(bank.Opening_Time),
                closingTime: this.parseTime(bank.Closing_Time),
                timeNotes: this.cleanText(bank.Time_Notes),
                
                // Services flags - handle both Y/N and Yes/No formats
                serviceFoodBank: this.parseBoolean(bank.Service_FoodBank),
                serviceCommunityMeals: this.parseBoolean(bank.Service_CommunityMeals),
                serviceDelivery: this.parseBoolean(bank.Service_Delivery),
                serviceClothing: this.parseBoolean(bank.Service_Clothing),
                serviceUtilities: this.parseBoolean(bank.Service_Utilities),
                serviceFurniture: this.parseBoolean(bank.Service_Furniture),
                
                accessType: this.cleanText(bank.Access_Type),
                latitude: parseFloat(bank.Latitude),
                longitude: parseFloat(bank.Longitude),
                hasCompleteInfo: this.parseBoolean(bank.Has_Complete_Info),
                lastUpdated: this.cleanText(bank.Last_Updated),
                coordinateSource: this.cleanText(bank.Coordinate_Source),
                region: this.currentRegion,
                
                distance: null,
                status: null,
                nextOpening: null
            };

            if (processedBank.borough) {
                this.uniqueBoroughs.add(processedBank.borough);
            }

            return processedBank;
        }).filter(bank => bank.name && bank.latitude && bank.longitude);

        return processedBanks;
    }

    parseBoolean(value) {
        if (!value) return false;
        const str = value.toString().toLowerCase();
        return str === 'y' || str === 'yes' || str === 'true' || str === '1';
    }

    cleanText(text) {
        if (!text || text === 'null' || text === 'undefined') return '';
        return text.toString().trim();
    }

    formatPhone(phone) {
        if (!phone || phone === 'null' || phone === 'undefined') return '';
        
        let cleaned = phone.toString().replace(/[^\d+\s]/g, '');
        
        if (cleaned.length === 11 && cleaned.startsWith('0')) {
            return cleaned.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
        }
        
        return cleaned;
    }

    parseTime(timeStr) {
        if (!timeStr || timeStr === 'null' || timeStr === 'undefined') return null;
        
        const time = timeStr.toString().trim();
        if (time.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            return time.substring(0, 5);
        }
        
        return null;
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', this.debounce((e) => {
            this.filters.search = e.target.value.toLowerCase();
            clearSearch.style.display = e.target.value ? 'flex' : 'none';
            
            if (e.target.value.length >= 3) {
                this.trackEvent('search_performed', {
                    search_term: e.target.value,
                    results_count: this.filteredFoodBanks.length
                });
            }
            
            this.applyFilters();
        }, 300));

        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            this.filters.search = '';
            clearSearch.style.display = 'none';
            this.applyFilters();
        });

        document.getElementById('locationBtn').addEventListener('click', () => {
            this.requestLocation();
        });

        document.querySelectorAll('.quick-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.quick-filter').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filters.quickFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });

        ['boroughFilter', 'dayFilter', 'serviceFilter', 'sortBy'].forEach(filterId => {
            document.getElementById(filterId).addEventListener('change', (e) => {
                this.filters[filterId.replace('Filter', '').replace('sortBy', 'sortBy')] = e.target.value;
                this.applyFilters();
            });
        });

        document.getElementById('filtersToggle').addEventListener('click', () => {
            const advancedFilters = document.getElementById('advancedFilters');
            advancedFilters.classList.toggle('show');
        });

        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modalOverlay')) {
                this.closeModal();
            }
        });

        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('loadMoreBtn').addEventListener('click', () => {
            this.loadMoreResults();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    populateBoroughFilter() {
        const boroughFilter = document.getElementById('boroughFilter');
        const currentBoroughs = new Set();
        
        this.currentFoodBanks.forEach(bank => {
            if (bank.borough) currentBoroughs.add(bank.borough);
        });
        
        const sortedBoroughs = Array.from(currentBoroughs).sort();
        
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
        const currentDay = now.getDay();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        this.currentFoodBanks.forEach(bank => {
            const status = this.getFoodBankStatus(bank, now, currentDay, currentTime);
            bank.status = status.status;
            bank.nextOpening = status.nextOpening;
        });

        const openNow = this.currentFoodBanks.filter(bank => bank.status === 'open').length;
        document.getElementById('openNow').textContent = openNow;
    }

    getFoodBankStatus(bank, now, currentDay, currentTime) {
        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = dayMap[currentDay];
        
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
        
        if (currentTime >= openTime && currentTime < closeTime) {
            return {
                status: 'open',
                nextOpening: null
            };
        }
        
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
            this.trackEvent('location_request_failed', { reason: 'not_supported' });
            return;
        }

        const locationBtn = document.getElementById('locationBtn');
        const locationText = locationBtn.querySelector('.location-text');

        locationBtn.disabled = true;
        if(locationText) locationText.textContent = 'Locating...';

        this.locationRequested = true;
        this.trackEvent('location_request_started');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                this.isLocationEnabled = true;
                
                if(locationText) locationText.textContent = 'Located';
                locationBtn.classList.add('location-active');
                locationBtn.disabled = false;
                
                this.calculateDistances();
                this.filters.sortBy = 'distance';
                document.getElementById('sortBy').value = 'distance';
                this.applyFilters();
                
                document.getElementById('locationStatus').textContent = '(sorted by distance)';
                
                const nearYou = this.currentFoodBanks.filter(bank => bank.distance && bank.distance <= 5).length;
                this.trackEvent('location_access_granted', {
                    food_banks_within_5_miles: nearYou,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                this.showLocationError(this.getLocationErrorMessage(error));
                if(locationText) locationText.textContent = 'Near Me';
                locationBtn.disabled = false;
                
                this.trackEvent('location_request_failed', {
                    reason: error.code === 1 ? 'permission_denied' : 
                           error.code === 2 ? 'position_unavailable' : 
                           error.code === 3 ? 'timeout' : 'unknown'
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
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

        this.currentFoodBanks.forEach(bank => {
            bank.distance = this.calculateHaversineDistance(
                this.userLocation.lat,
                this.userLocation.lng,
                bank.latitude,
                bank.longitude
            );
        });

        const nearYou = this.currentFoodBanks.filter(bank => bank.distance && bank.distance <= 5).length;
        document.getElementById('nearYou').textContent = nearYou;
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 3959;
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
        let filtered = [...this.currentFoodBanks];

        if (this.filters.search) {
            filtered = filtered.filter(bank =>
                bank.name.toLowerCase().includes(this.filters.search) ||
                bank.fullAddress.toLowerCase().includes(this.filters.search) ||
                bank.postcode.toLowerCase().includes(this.filters.search) ||
                bank.borough.toLowerCase().includes(this.filters.search) ||
                (bank.area && bank.area.toLowerCase().includes(this.filters.search))
            );
        }

        if (this.filters.borough !== 'all') {
            filtered = filtered.filter(bank =>
                bank.borough.toLowerCase() === this.filters.borough
            );
        }

        if (this.filters.day !== 'all') {
            filtered = this.applyDayFilter(filtered, this.filters.day);
        }

        if (this.filters.service !== 'all') {
            filtered = this.applyServiceFilter(filtered, this.filters.service);
        }

        filtered = this.applyQuickFilter(filtered, this.filters.quickFilter);
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

        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (endIndex < this.filteredFoodBanks.length) {
            loadMoreContainer.style.display = 'block';
        } else {
            loadMoreContainer.style.display = 'none';
        }
    }

    createFoodBankCard(bank) {
        const card = document.createElement('div');
        card.className = 'bg-white border-[3px] border-[#1B4332] rounded-sm p-5 flex flex-col gap-3';
        card.style.boxShadow = '4px 4px 0 #1B4332';
        card.setAttribute('data-id', bank.id);

        const statusClass = bank.status === 'open' ? 'status-open' : bank.status === 'opening-soon' ? 'status-opening-soon' : 'status-closed';
        const statusText = this.getStatusText(bank);
        const distanceText = bank.distance ? `${bank.distance.toFixed(1)} mi` : '';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <span class="${statusClass} text-xs font-bold px-2.5 py-1 rounded-sm uppercase tracking-wide">${statusText}</span>
                ${distanceText ? `<span class="text-[#E76F51] text-xs font-bold shrink-0">${distanceText}</span>` : ''}
            </div>

            <h3 class="font-['DM_Serif_Display',Georgia,serif] text-[#1B4332] text-lg leading-tight">${bank.name}</h3>

            <p class="text-[#2D3436]/60 text-xs">${bank.borough}${bank.area ? ' · ' + bank.area : ''}</p>

            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#2D3436]/70">
                <span class="font-bold">${bank.cost || 'Contact for details'}</span>
                <span>${this.formatAccessType(bank.accessType)}</span>
            </div>

            <div class="flex flex-wrap gap-1.5">
                ${this.renderServiceIcons(bank)}
            </div>

            <p class="text-[#2D3436]/50 text-xs leading-snug">${bank.fullAddress}${bank.postcode ? ', ' + bank.postcode : ''}</p>

            ${bank.nextOpening ? `<p class="text-[#E76F51] text-xs font-bold">${bank.nextOpening}</p>` : ''}

            <div class="mt-auto pt-3 border-t border-[#2D3436]/10 flex gap-3">
                <button class="flex-1 text-[#1B4332] font-bold text-xs py-2 px-3 border-2 border-[#1B4332] rounded-sm hover:bg-[#1B4332] hover:text-[#FDF6EC] transition-colors min-h-[36px]" onclick="foodBanksManager.openDirections('${bank.id}')">Directions</button>
                <button class="flex-1 bg-[#1B4332] text-[#FDF6EC] font-bold text-xs py-2 px-3 border-2 border-[#1B4332] rounded-sm hover:bg-[#142e23] transition-colors min-h-[36px]" onclick="foodBanksManager.showDetails('${bank.id}')">More Info</button>
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
            case 'referral only':
                return 'Referral Required';
            case 'both':
                return 'Walk-in & Referral';
            default:
                return accessType;
        }
    }

    renderServiceIcons(bank) {
        const services = [
            { key: 'serviceFoodBank', label: 'Food Bank' },
            { key: 'serviceCommunityMeals', label: 'Meals' },
            { key: 'serviceDelivery', label: 'Delivery' },
            { key: 'serviceClothing', label: 'Clothing' },
            { key: 'serviceFurniture', label: 'Furniture' },
            { key: 'serviceUtilities', label: 'Utilities' }
        ];

        return services.filter(s => bank[s.key]).map(service => {
            return `<span class="bg-[#1B4332]/10 text-[#1B4332] text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide">${service.label}</span>`;
        }).join('');
    }

    loadMoreResults() {
        this.currentPage++;
        this.renderFoodBanks();
    }

    showDetails(bankId) {
        const bank = this.currentFoodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const modal = document.getElementById('modalOverlay');
        const modalBody = document.getElementById('modalBody');
        
        modalBody.innerHTML = this.createDetailedView(bank);
        modal.style.display = 'flex';
        
        document.getElementById('modalClose').focus();
        
        this.trackEvent('food_bank_details_viewed', {
            food_bank_name: bank.name,
            borough: bank.borough,
            region: bank.region,
            distance: bank.distance ? bank.distance.toFixed(1) : null,
            status: bank.status,
            has_phone: !!bank.phone,
            has_email: !!bank.email,
            has_website: !!bank.website
        });
    }

    createDetailedView(bank) {
        const openingHours = this.formatOpeningHours(bank);
        const services = this.formatDetailedServices(bank);
        const statusClass = bank.status === 'open' ? 'status-open' : bank.status === 'opening-soon' ? 'status-opening-soon' : 'status-closed';

        return `
            <div class="flex items-start justify-between gap-3 mb-6">
                <h2 class="font-['DM_Serif_Display',Georgia,serif] text-[#1B4332] text-2xl sm:text-3xl leading-tight">${bank.name}</h2>
                <span class="${statusClass} text-xs font-bold px-3 py-1.5 rounded-sm uppercase tracking-wide shrink-0">${this.getStatusText(bank)}</span>
            </div>

            <div class="mb-6 pb-6 border-b-2 border-[#1B4332]/10">
                <h3 class="font-bold text-[#1B4332] text-sm uppercase tracking-wide mb-3">Location & Contact</h3>
                <p class="text-[#2D3436] text-sm mb-3">${bank.fullAddress}${bank.postcode ? ', ' + bank.postcode : ''}</p>
                <div class="space-y-2">
                    ${bank.phone ? '<a href="tel:' + bank.phone + '" class="flex items-center gap-2 text-[#1B4332] font-bold text-sm hover:text-[#E76F51] transition-colors">' + bank.phone + '</a>' : ''}
                    ${bank.email ? '<a href="mailto:' + bank.email + '" class="flex items-center gap-2 text-[#1B4332] text-sm hover:text-[#E76F51] transition-colors break-all">' + bank.email + '</a>' : ''}
                    ${bank.website ? '<a href="' + bank.website + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-[#E76F51] text-sm font-bold hover:text-[#1B4332] transition-colors">Visit Website &rarr;</a>' : ''}
                </div>
                ${bank.distance ? '<p class="text-[#E76F51] text-xs font-bold mt-3">' + bank.distance.toFixed(1) + ' miles from you</p>' : ''}
            </div>

            <div class="mb-6 pb-6 border-b-2 border-[#1B4332]/10">
                <h3 class="font-bold text-[#1B4332] text-sm uppercase tracking-wide mb-3">Opening Hours</h3>
                ${openingHours}
                ${bank.timeNotes ? '<p class="text-[#E76F51] text-xs font-bold mt-2">' + bank.timeNotes + '</p>' : ''}
            </div>

            <div class="mb-6 pb-6 border-b-2 border-[#1B4332]/10">
                <h3 class="font-bold text-[#1B4332] text-sm uppercase tracking-wide mb-3">Services</h3>
                ${services}
            </div>

            <div class="mb-6 pb-6 border-b-2 border-[#1B4332]/10">
                <h3 class="font-bold text-[#1B4332] text-sm uppercase tracking-wide mb-3">Access Information</h3>
                <div class="space-y-2 text-sm text-[#2D3436]">
                    <p><strong>Cost:</strong> ${bank.cost || 'Contact for details'}</p>
                    <p><strong>Access:</strong> ${this.formatAccessType(bank.accessType)}</p>
                    ${bank.requirements ? '<p><strong>Requirements:</strong> ' + bank.requirements + '</p>' : ''}
                </div>
            </div>

            ${bank.notes ? '<div class="mb-6 pb-6 border-b-2 border-[#1B4332]/10"><h3 class="font-bold text-[#1B4332] text-sm uppercase tracking-wide mb-3">Additional Info</h3><p class="text-[#2D3436]/70 text-sm leading-relaxed">' + bank.notes + '</p></div>' : ''}

            <div class="flex flex-wrap gap-3">
                <button class="flex-1 bg-[#1B4332] text-[#FDF6EC] font-bold text-sm py-3 px-4 border-[3px] border-[#1B4332] rounded-sm hover:bg-[#142e23] transition-colors min-h-[44px]" onclick="foodBanksManager.openDirections('${bank.id}')">Get Directions</button>
                ${bank.phone ? '<a href="tel:' + bank.phone + '" class="flex-1 text-center text-[#1B4332] font-bold text-sm py-3 px-4 border-[3px] border-[#1B4332] rounded-sm hover:bg-[#1B4332] hover:text-[#FDF6EC] transition-colors min-h-[44px] flex items-center justify-center">Call Now</a>' : ''}
                <button class="text-[#E76F51] font-bold text-sm py-3 px-4 hover:text-[#1B4332] transition-colors min-h-[44px]" onclick="foodBanksManager.shareLocation('${bank.id}')">Share</button>
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

            return `<div class="flex justify-between py-1.5 ${isOpen ? 'text-[#2D3436]' : 'text-[#2D3436]/30'}">
                <span class="font-bold text-sm">${day.name}</span>
                <span class="text-sm ${isOpen ? 'text-[#1B4332] font-bold' : ''}">${times}</span>
            </div>`;
        }).join('');

        return `<div class="divide-y divide-[#1B4332]/10">${hours}</div>`;
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
            return '<p class="text-[#2D3436]/50 text-sm">Contact for service details</p>';
        }

        return `
            <div class="flex flex-wrap gap-2 mb-3">
                ${services.map(service => `<span class="bg-[#1B4332]/10 text-[#1B4332] text-xs font-bold px-3 py-1 rounded-sm">${service}</span>`).join('')}
            </div>
            ${bank.services ? '<p class="text-[#2D3436]/60 text-xs leading-relaxed">' + bank.services + '</p>' : ''}
        `;
    }

    closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
    }

    openDirections(bankId) {
        const bank = this.currentFoodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const destination = encodeURIComponent(`${bank.fullAddress}, ${bank.postcode}`);
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
        
        window.open(googleMapsUrl, '_blank');
        
        this.trackEvent('directions_requested', {
            food_bank_name: bank.name,
            borough: bank.borough,
            region: bank.region,
            distance: bank.distance ? bank.distance.toFixed(1) : null,
            status: bank.status,
            access_type: bank.accessType
        });
    }

    shareLocation(bankId) {
        const bank = this.currentFoodBanks.find(b => b.id === bankId);
        if (!bank) return;

        const shareText = `${bank.name} - ${bank.fullAddress}${bank.postcode ? `, ${bank.postcode}` : ''}`;
        const shareUrl = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: bank.name,
                text: shareText,
                url: shareUrl
            }).then(() => {
                this.trackEvent('food_bank_shared', {
                    food_bank_name: bank.name,
                    borough: bank.borough,
                    region: bank.region,
                    share_method: 'native'
                });
            }).catch(() => {
            });
        } else {
            navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
                this.showToast('Location details copied to clipboard');
                this.trackEvent('food_bank_shared', {
                    food_bank_name: bank.name,
                    borough: bank.borough,
                    region: bank.region,
                    share_method: 'clipboard'
                });
            });
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #1B4332;
            color: #FDF6EC;
            padding: 12px 24px;
            border-radius: 2px;
            border: 2px solid #1B4332;
            box-shadow: 3px 3px 0 #1A1A2E;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: Inter, system-ui, sans-serif;
            font-size: 14px;
            font-weight: 700;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.style.opacity = '1', 100);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    clearAllFilters() {
        this.filters = {
            search: '',
            borough: 'all',
            day: 'all',
            service: 'all',
            quickFilter: 'all',
            sortBy: this.isLocationEnabled ? 'distance' : 'name'
        };

        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearch').style.display = 'none';
        document.getElementById('boroughFilter').value = 'all';
        document.getElementById('dayFilter').value = 'all';
        document.getElementById('serviceFilter').value = 'all';
        document.getElementById('sortBy').value = this.filters.sortBy;
        
        document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.quick-filter[data-filter="all"]').classList.add('active');

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

function clearAllFilters() {
    if (window.foodBanksManager) {
        window.foodBanksManager.clearAllFilters();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.foodBanksManager = new FoodBanksManager();
});