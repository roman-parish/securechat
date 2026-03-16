// Custom Service Worker — injected with Workbox precache manifest
// Push handling is inlined here (no importScripts) for iOS Safari compatibility

// Workbox injects the precache manifest here:
// self.__WB_MANIFEST

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Take control immediately
self.skipWaiting();
self.clients.claim();

// Precache all build assets
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// SPA navigation fallback
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api/, /^\/uploads/, /^\/ws/],
  })
);

// API — network first, short cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
);

// Uploads — cache first, long TTL
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'uploads-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 })],
  })
);

// ─── Push Notifications ─────────────────────────────────────────────────────
// Inlined directly — never use importScripts for push on iOS, it fails silently

self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('SecureChat', {
        body: 'New message',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
      })
    );
    return;
  }

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'SecureChat', body: event.data.text() }; }

  const title = data.title || 'SecureChat';
  const options = {
    body: data.body || 'New encrypted message',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: data.conversationId ? 'conv-' + data.conversationId : 'securechat',
    renotify: true,
    silent: false,
    data: {
      url: data.url || '/',
      conversationId: data.conversationId || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] Notification shown'))
      .catch((err) => console.error('[SW] showNotification failed:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const conversationId = event.notification.data && event.notification.data.conversationId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl, conversationId });
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});
