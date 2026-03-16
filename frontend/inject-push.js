/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/w5rcp-romanparish/securechat
 */
// Post-build script: appends push handler to the generated sw.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, 'dist/sw.js');

if (!existsSync(swPath)) {
  console.error('[inject-push] dist/sw.js not found!');
  process.exit(1);
}

const pushHandler = `
// ── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) {
    event.waitUntil(self.registration.showNotification('SecureChat', {
      body: 'New message',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
    }));
    return;
  }
  var data;
  try { data = event.data.json(); } catch(e) { data = { title: 'SecureChat', body: event.data.text() }; }
  var title = data.title || 'SecureChat';
  var options = {
    body: data.body || 'New encrypted message',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    tag: data.conversationId ? 'conv-' + data.conversationId : 'securechat',
    renotify: true,
    data: { url: data.url || '/', conversationId: data.conversationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  var conversationId = event.notification.data && event.notification.data.conversationId;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) {
          clients[i].focus();
          clients[i].postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl, conversationId: conversationId });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
`;

const existing = readFileSync(swPath, 'utf8');
writeFileSync(swPath, existing + pushHandler);
console.log('[inject-push] ✅ Push handler appended to sw.js');
