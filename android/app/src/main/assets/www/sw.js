const CACHE_NAME = 'flip-clock-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-caching partial error:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to revalidate (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Offline, ignore network error
        });
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // If offline and requesting document, return root / index.html
        if (event.request.destination === 'document') {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});

// --------------------------------------------------------------------------
// Background Alarm Notifications & Actions (Snooze / Dismiss)
// --------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action; // 'snooze', 'dismiss', or default body click

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and post alarm action message
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'ALARM_NOTIFICATION_ACTION',
            action: action || 'open'
          });
          return client.focus();
        }
      }
      // If no window is open, open one
      if (self.clients.openWindow) {
        return self.clients.openWindow('/?alarm=' + (action || 'open'));
      }
    })
  );
});

