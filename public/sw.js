/**
 * sw.js - Service Worker
 * 
 * Implements offline shell caching for Alfloest PV.
 */

const CACHE_NAME = 'alfloest-pv-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Interception
self.addEventListener('fetch', (e) => {
  const requestUrl = new URL(e.request.url);

  // Avoid caching Google API requests or third-party OAuth scripts
  if (
    requestUrl.hostname.includes('googleapis.com') ||
    requestUrl.hostname.includes('google.com')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached, but fetch latest in background (stale-while-revalidate)
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        // Cache assets dynamically
        if (
          networkResponse.status === 200 &&
          e.request.method === 'GET' &&
          (requestUrl.origin === self.location.origin)
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
