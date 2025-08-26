const CACHE_NAME = 'homeless-aid-uk-v1';
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

// Activate service worker
self.addEventListener('activate', function(event) {
  console.log('✅ Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Return cached version or fetch from network
        if (response) {
          console.log('📦 Service Worker: Serving from cache', event.request.url);
          return response;
        }
        
        return fetch(event.request).then(function(response) {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(function() {
          // If both cache and network fail, return a custom offline page
          if (event.request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
  );
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