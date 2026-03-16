/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    // Unregister any old SW registrations (e.g. old /sw.js from previous builds)
    // This is critical on iOS — a stale SW blocks the new one from taking control
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (swUrl && !swUrl.includes('sw.js')) {
        console.log('[SW] Unregistering old SW:', swUrl);
        await reg.unregister();
      }
    }

    // Register the current SW
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SW] Registered:', registration.scope);

    // Check for updates every hour
    setInterval(() => registration.update(), 60 * 60 * 1000);

  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }

  // Listen for messages from SW (notification clicks)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      window.dispatchEvent(new CustomEvent('sw:notification-click', {
        detail: {
          url: event.data.url,
          conversationId: event.data.conversationId,
        },
      }));
    }
  });
}

if (document.readyState === 'complete') {
  registerSW();
} else {
  window.addEventListener('load', registerSW);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
