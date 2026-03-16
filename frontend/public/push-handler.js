// Push notification handler — imported into the Workbox-generated service worker
// This is a plain JS file (no ES modules, no imports) executed in SW scope

self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  if (!event.data) {
    console.warn('[SW] Push event has no data — showing generic notification');
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
  try {
    data = event.data.json();
  } catch {
    data = { title: 'SecureChat', body: event.data.text() };
  }

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
      .then(() => console.log('[SW] Notification shown successfully'))
      .catch((err) => console.error('[SW] showNotification error:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  if (event.action === 'dismiss') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  var conversationId = event.notification.data && event.notification.data.conversationId;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Focus existing window if open
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if ('focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: targetUrl,
              conversationId: conversationId,
            });
            return;
          }
        }
        // Open new window if app is closed
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
