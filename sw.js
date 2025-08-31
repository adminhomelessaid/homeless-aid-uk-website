const CACHE_VERSION = 'v2024.12.19.1';
const CACHE_NAME = `homeless-aid-${CACHE_VERSION}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/feed-times.csv',
  '/donate.html',
  '/volunteer.html',
  '/food-bank.html',
  '/contact.html',
  '/useful-links.html',
  '/Branding/HomelessAidUKLogo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install service worker
self.addEventListener('install', function(event) {
  console.log('🔧 Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('🗄️ Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.error('❌ Service Worker: Cache failed', error);
      })
  );
});

// Clear old caches on activation
self.addEventListener('activate', event => {
    console.log('🔧 Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => {
                        console.log('🗑️ Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            console.log('✅ Service Worker: Activated with cache', CACHE_NAME);
            return self.clients.claim();
        })
    );
});

// FORCE DISABLE SERVICE WORKER - DELETE ALL CACHES
self.addEventListener('fetch', function(event) {
  console.log('🗑️ Service Worker: DISABLED - fetching from network only');
  event.respondWith(fetch(event.request));
});

// Handle background sync for offline actions
self.addEventListener('sync', function(event) {
  if (event.tag === 'background-sync') {
    console.log('🔄 Service Worker: Background sync');
    event.waitUntil(
      // Handle any queued actions when back online
      Promise.resolve()
    );
  }
});

// Handle push notifications (if implemented later)
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    console.log('🔔 Service Worker: Push received', data);
    
    const options = {
      body: data.body,
      icon: '/Branding/HomelessAidUKLogo.png',
      badge: '/Branding/HomelessAidUKLogo.png',
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: [
        {
          action: 'view',
          title: 'View',
          icon: '/Branding/HomelessAidUKLogo.png'
        },
        {
          action: 'close',
          title: 'Close'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});