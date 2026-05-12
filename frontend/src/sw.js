// SecureChat Service Worker — processed by VitePWA (injectManifest strategy)
// Push handling is inlined (no importScripts) for iOS Safari compatibility.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Take control of all clients immediately — critical for PWA update flow
self.skipWaiting();
self.clients.claim();

// VitePWA injects the precache manifest here at build time
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// SPA navigation — serve index.html for all non-API routes
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api/, /^\/uploads/, /^\/ws/],
  })
);

// API responses — network first, 5 min cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
);

// Uploaded files — cache first, 24 h TTL
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'uploads-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 })],
  })
);

// ─── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification('SecureChat', {
        body: 'New message',
        icon: '/icons/icon-192.png',
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
    // badge is intentionally omitted — not supported on iOS and causes errors
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
      .catch((err) => console.error('[SW] showNotification failed:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data?.url) || '/';
  const conversationId = event.notification.data?.conversationId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
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
