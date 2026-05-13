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

// Run before React renders to fix iOS PWA layout bugs.
(function () {
  const html = document.documentElement;

  // 1. Apply saved theme. iOS paints the home-indicator safe-area zone using
  //    the html/body background colour. We set it as an inline style (highest
  //    specificity) so the zone matches the bottom bars in both light and dark
  //    mode before any external CSS loads.
  const theme = localStorage.getItem('theme') || 'dark';
  const themeBg = theme === 'light' ? '#f5f5fa' : '#0f0f13';
  html.setAttribute('data-theme', theme);
  html.style.background = themeBg;
  document.body.style.background = themeBg;
  const metaTC = document.querySelector('meta[name="theme-color"]');
  if (metaTC) metaTC.setAttribute('content', theme === 'light' ? '#f5f5fa' : '#0f0f13');

  // 2. Detect iOS PWA standalone mode. navigator.standalone is the most reliable
  //    signal — @media (display-mode: standalone) is flaky on iOS Safari.
  //    Adding body.ios-pwa lets CSS target it directly with env() + hard fallback.
  const isIosPwa = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (isIosPwa) document.body.classList.add('ios-pwa');

  // 3. Measure env(safe-area-inset-bottom). On some iOS versions env() returns 0
  //    before layout resolves. We measure now AND after load as a correction pass.
  //    --bsa is used by legacy components; ios-pwa class drives the new approach.
  function applyBsa() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(el);
    const bsa = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    document.body.removeChild(el);
    // Only set --bsa when env() resolves to a real value (viewport-fit=cover).
    // If env()=0, iOS is managing the safe area itself — no padding needed.
    if (bsa > 0) {
      html.style.setProperty('--bsa', bsa + 'px');
    }
  }

  applyBsa();
  window.addEventListener('load', applyBsa, { once: true });
}());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
