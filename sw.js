// Yes Chef - Service Worker
const CACHE_NAME = 'yes-chef-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/base.css',
  '/css/views.css',
  '/js/bootstrap.js',
  '/js/signals.js',
  '/js/router.js',
  '/js/data/recipes.js',
  '/js/types/recipe.js',
  '/js/utils/scaling.js',
  '/js/utils/tags.js',
  '/js/views/view-manager.js',
  '/js/views/browse.js',
  '/js/views/detail.js',
  '/js/views/cooking.js',
  '/js/views/empty-states.js',
  '/js/components/recipe-card.js',
  '/js/components/servings-stepper.js',
  '/js/components/cooking-step.js',
  '/js/components/timer-tray.js',
  '/js/timers/timer.js',
  '/js/timers/manager.js',
  '/js/timers/sw-messaging.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (e.g., Firestore)
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  );
});

// Handle timer notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_TIMER') {
    const { timerId, label, delayMs } = event.data;
    setTimeout(() => {
      self.registration.showNotification('Timer Complete', {
        body: `${label} is ready!`,
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        tag: timerId,
        requireInteraction: true,
        actions: [
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });
    }, delayMs);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});