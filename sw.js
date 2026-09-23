const CACHE_NAME = 'mon-assistant-v17-lists-stable';
const STATIC_ASSETS = [
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API responses. Calendar/mail data must always be fresh.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML, JS and CSS are network-first so a deployment is visible immediately.
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => response)
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images and manifest can use cache-first.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});



self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data
      ? event.data.json()
      : {};
  } catch (_error) {
    payload = {
      title: 'Mon assistant',
      body: event.data
        ? event.data.text()
        : ''
    };
  }

  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'Mon assistant',
      {
        body:
          payload.body ||
          'Tu as un nouveau rappel.',
        icon:
          '/favicon.png',
        badge:
          '/icon.svg',
        tag:
          payload.tag ||
          'mon-assistant-personal',
        renotify:
          true,
        data: {
          url:
            payload.url ||
            '/#/home'
        }
      }
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data?.url ||
    '/#/home';

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(windowClients => {
        for (
          const client of windowClients
        ) {
          if (
            'focus' in client
          ) {
            client
              .navigate(target)
              .catch(function () {});

            return client.focus();
          }
        }

        return clients.openWindow
          ? clients.openWindow(target)
          : null;
      })
  );
});
