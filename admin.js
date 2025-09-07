// Admin Panel JavaScript
console.log('🔐 Admin Panel loaded');

// Simple authentication (in production, use proper backend authentication)
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'homelessaid2024' // Change this in production
};

let feedingData = [];
let currentEditIndex = -1;

// DOM Elements
const adminLogin = document.getElementById('adminLogin');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const adminTabs = document.querySelectorAll('.admin-tab');
const adminSections = document.querySelectorAll('.admin-section');
const feedingTable = document.getElementById('feedingTableBody');
const editForm = document.getElementById('editForm');
const feedingEditForm = document.getElementById('feedingEditForm');
const addFeedingBtn = document.getElementById('addFeedingBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// Authentication
function login(username, password) {
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem('adminLoggedIn', 'true');
        showAdminPanel();
        return true;
    }
    return false;
}

function logout() {
    localStorage.removeItem('adminLoggedIn');
    showLogin();
}

function isLoggedIn() {
    return localStorage.getItem('adminLoggedIn') === 'true';
}

function showLogin() {
    adminLogin.style.display = 'block';
    adminPanel.style.display = 'none';
}

function showAdminPanel() {
    adminLogin.style.display = 'none';
    adminPanel.style.display = 'block';
    loadFeedingData();
    updateAnalytics();
}

// Load CSV data
async function loadFeedingData() {
    try {
        const response = await fetch('feed-times.csv');
        const csvText = await response.text();
        
        // Parse CSV
        const lines = csvText.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        feedingData = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length === headers.length) {
                const entry = {};
                headers.forEach((header, index) => {
                    entry[header] = values[index];
                });
                feedingData.push(entry);
            }
        }
        
        renderFeedingTable();
        console.log('📊 Loaded', feedingData.length, 'feeding locations');
    } catch (error) {
        console.error('❌ Failed to load feeding data:', error);
        alert('Failed to load feeding data. Please try again.');
    }
}

// Render feeding times table
function renderFeedingTable() {
    feedingTable.innerHTML = '';
    
    feedingData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.Day || ''}</td>
            <td>${item.Time || ''}</td>
            <td>${item['Address 1'] || ''}</td>
            <td>${item.Postcode || ''}</td>
            <td>${item.Town || ''}</td>
            <td>${item.Type || ''}</td>
            <td>
                <span class="${(item['Enable Calendar'] || '').toLowerCase() === 'yes' ? 'enabled' : 'disabled'}">
                    ${item['Enable Calendar'] || 'No'}
                </span>
            </td>
            <td>
                <button class="edit-btn" onclick="editFeedingLocation(${index})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="delete-btn" onclick="deleteFeedingLocation(${index})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        `;
        feedingTable.appendChild(row);
    });
}

// Edit feeding location
function editFeedingLocation(index) {
    currentEditIndex = index;
    const item = feedingData[index];
    
    // Populate form
    document.getElementById('editDay').value = item.Day || '';
    document.getElementById('editTime').value = item.Time || '';
    document.getElementById('editAddress').value = item['Address 1'] || '';
    document.getElementById('editPostcode').value = item.Postcode || '';
    document.getElementById('editTown').value = item.Town || '';
    document.getElementById('editType').value = item.Type || '';
    document.getElementById('editNotes').value = item.Notes || '';
    document.getElementById('editCalendar').value = item['Enable Calendar'] || 'No';
    
    document.getElementById('editFormTitle').textContent = 'Edit Feeding Location';
    editForm.classList.add('active');
}

// Add new feeding location
function addNewFeedingLocation() {
    currentEditIndex = -1;
    
    // Clear form
    feedingEditForm.reset();
    document.getElementById('editFormTitle').textContent = 'Add New Feeding Location';
    editForm.classList.add('active');
}

// Delete feeding location
function deleteFeedingLocation(index) {
    if (confirm('Are you sure you want to delete this feeding location?')) {
        feedingData.splice(index, 1);
        renderFeedingTable();
        saveFeedingData();
        updateAnalytics();
    }
}

// Save feeding data (in production, this would save to backend)
function saveFeedingData() {
    // Generate CSV content
    const headers = ['Day', 'Time', 'Address 1', 'Postcode', 'Town', 'Type', 'Notes', 'Enable Calendar'];
    const csvContent = headers.join(',') + '\n' + 
        feedingData.map(item => 
            headers.map(header => item[header] || '').join(',')
        ).join('\n');
    
    // In a real application, you would send this to your backend
    console.log('💾 Saving CSV data:', csvContent);
    
    // For demo purposes, we'll store in localStorage
    localStorage.setItem('feedingData', csvContent);
    
    // Create a download link for the admin
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feed-times.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Data saved! CSV file has been downloaded.');
}

// Update analytics
function updateAnalytics() {
    const totalLocations = feedingData.length;
    const activeCalendar = feedingData.filter(item => 
        (item['Enable Calendar'] || '').toLowerCase() === 'yes'
    ).length;
    
    const dailyFeeds = {};
    feedingData.forEach(item => {
        const day = item.Day;
        if (day) {
            dailyFeeds[day] = (dailyFeeds[day] || 0) + 1;
        }
    });
    
    const avgDailyFeeds = Object.values(dailyFeeds).reduce((a, b) => a + b, 0) / 7;
    
    document.getElementById('totalLocations').textContent = totalLocations;
    document.getElementById('activeCalendar').textContent = activeCalendar;
    document.getElementById('dailyFeeds').textContent = Math.round(avgDailyFeeds * 10) / 10;
}

// Event Listeners
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (login(username, password)) {
        console.log('✅ Admin login successful');
    } else {
        alert('Invalid credentials. Please try again.');
        console.log('❌ Admin login failed');
    }
});

logoutBtn.addEventListener('click', logout);

// Tab switching
adminTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        const targetTab = this.dataset.tab;
        
        // Update active tab
        adminTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        // Show target section
        adminSections.forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(targetTab).classList.add('active');
    });
});

// Edit form handling
addFeedingBtn.addEventListener('click', addNewFeedingLocation);
cancelEditBtn.addEventListener('click', function() {
    editForm.classList.remove('active');
});

feedingEditForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const locationData = {
        'Day': formData.get('day'),
        'Time': formData.get('time'),
        'Address 1': formData.get('address'),
        'Postcode': formData.get('postcode'),
        'Town': formData.get('town'),
        'Type': formData.get('type'),
        'Notes': formData.get('notes'),
        'Enable Calendar': formData.get('calendar')
    };
    
    if (currentEditIndex >= 0) {
        // Update existing
        feedingData[currentEditIndex] = locationData;
    } else {
        // Add new
        feedingData.push(locationData);
    }
    
    renderFeedingTable();
    saveFeedingData();
    updateAnalytics();
    editForm.classList.remove('active');
});

// Content management
document.getElementById('saveContentBtn').addEventListener('click', function() {
    const heroTitle = document.getElementById('heroTitle').value;
    const helplineNumber = document.getElementById('helplineNumber').value;
    const aboutText = document.getElementById('aboutText').value;
    
    // In production, save to backend
    localStorage.setItem('contentData', JSON.stringify({
        heroTitle,
        helplineNumber,
        aboutText
    }));
    
    alert('Content saved successfully!');
});

// Click outside to close modal
editForm.addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('active');
    }
});

// Attendance Data Management
async function loadAttendanceData() {
    try {
        // Load attendance statistics
        const statsResponse = await fetch('/api/attendance/stats');
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            document.getElementById('attendanceToday').textContent = stats.today || 0;
            document.getElementById('attendanceWeek').textContent = stats.week || 0;
            document.getElementById('attendanceMonth').textContent = stats.month || 0;
            document.getElementById('attendanceTotal').textContent = stats.allTime || 0;
        }
        
        // Load attendance logs
        const logsResponse = await fetch('/api/attendance/list?limit=50');
        if (logsResponse.ok) {
            const data = await logsResponse.json();
            renderAttendanceTable(data.logs || []);
        }
    } catch (error) {
        console.error('Error loading attendance data:', error);
        document.getElementById('attendanceEmpty').style.display = 'block';
        document.getElementById('attendanceTable').style.display = 'none';
    }
}

function renderAttendanceTable(logs) {
    const tbody = document.getElementById('attendanceTableBody');
    const emptyState = document.getElementById('attendanceEmpty');
    const table = document.getElementById('attendanceTable');
    
    if (logs.length === 0) {
        emptyState.style.display = 'block';
        table.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    table.style.display = 'table';
    
    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${new Date(log.date).toLocaleDateString()}</td>
            <td>${log.eventName}</td>
            <td>${log.town}</td>
            <td>${log.peopleServed}</td>
            <td>${log.outreachName}</td>
            <td>${log.notes || '-'}</td>
            <td>${new Date(log.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Export attendance data
document.getElementById('exportAttendanceBtn')?.addEventListener('click', async function() {
    try {
        const response = await fetch('/api/attendance/list?limit=9999');
        if (response.ok) {
            const data = await response.json();
            const csv = convertToCSV(data.logs);
            downloadCSV(csv, `attendance_${new Date().toISOString().split('T')[0]}.csv`);
        }
    } catch (error) {
        console.error('Error exporting attendance data:', error);
        alert('Failed to export attendance data');
    }
});

// Refresh attendance data
document.getElementById('refreshAttendanceBtn')?.addEventListener('click', function() {
    loadAttendanceData();
});

function convertToCSV(logs) {
    const headers = ['Date', 'Event', 'Location', 'Town', 'People Served', 'Logged By', 'Notes', 'Timestamp'];
    const rows = logs.map(log => [
        log.date,
        log.eventName,
        log.location,
        log.town,
        log.peopleServed,
        log.outreachName,
        log.notes || '',
        log.timestamp
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// Update tab switching to load attendance data
const originalTabClickHandler = tabs.forEach;
tabs.forEach(tab => {
    tab.addEventListener('click', function() {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        
        this.classList.add('active');
        const targetTab = this.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
        
        // Load attendance data when attendance tab is clicked
        if (targetTab === 'attendance') {
            loadAttendanceData();
        }
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Admin panel initialized');
    
    if (isLoggedIn()) {
        showAdminPanel();
    } else {
        showLogin();
    }
});