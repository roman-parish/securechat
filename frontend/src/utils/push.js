/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { apiFetch } from './api.js';

/**
 * iOS PWA Push Notification Notes:
 * - Requires iOS 16.4+ in standalone (home screen) mode
 * - Permission must be requested from a direct user gesture (button tap)
 * - PushManager.subscribe() must be called after SW is fully active
 * - Subscriptions are lost if user removes/re-adds the app — always re-subscribe on open
 */

export async function isPrivateMode() {
  // Detect private/incognito mode by testing storage availability
  // Safari private mode disables SW and IndexedDB quota is 0
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('__private_test__');
      req.onsuccess = () => { req.result.close(); resolve(false); };
      req.onerror = () => resolve(true);
    });
    return db;
  } catch {
    return true;
  }
}

export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function subscribeToPush() {
  console.log('[push] subscribeToPush() called');
  console.log('[push] isPushSupported:', isPushSupported());
  console.log('[push] permission:', typeof Notification !== 'undefined' ? Notification.permission : 'N/A');
  console.log('[push] standalone:', isStandalone());

  if (!isPushSupported()) {
    console.warn('[push] Push not supported on this browser/OS');
    return false;
  }
  if (Notification.permission !== 'granted') {
    console.warn('[push] Notification permission not granted:', Notification.permission);
    return false;
  }

  try {
    // Fetch VAPID key
    console.log('[push] Fetching VAPID key...');
    const { publicKey } = await apiFetch('/push/vapid-public-key');
    if (!publicKey) {
      console.error('[push] No VAPID key on server — check .env VAPID_PUBLIC_KEY');
      return false;
    }
    console.log('[push] VAPID key received');

    // Wait for SW to be fully active (iOS can be slow)
    console.log('[push] Waiting for SW...');
    const registration = await getActiveRegistration();
    if (!registration) {
      console.error('[push] No active service worker after timeout');
      return false;
    }

    console.log('[push] SW active:', registration.scope, '| state:', registration.active?.state);

    // Get or create subscription
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Subscription exists — refresh it on the server (endpoint may have rotated)
      console.log('[push] Refreshing existing subscription');
      try {
        await apiFetch('/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        return true;
      } catch (err) {
        // Server save failed — unsubscribe and get a fresh one
        console.warn('[push] Refresh failed, forcing new subscription:', err.message);
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    // Create new subscription
    console.log('[push] Creating new push subscription...');
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    console.log('[push] Subscribed:', subscription.endpoint);

    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    console.log('[push] Subscription saved to server');
    return true;
  } catch (err) {
    // Common errors:
    // - AbortError: SW not ready
    // - NotAllowedError: permission denied
    // - InvalidStateError: SW registration issue
    console.error('[push] Subscribe failed:', err.name, '-', err.message);
    return false;
  }
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiFetch('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      console.log('[push] Unsubscribed');
    }
  } catch (err) {
    console.error('[push] Unsubscribe failed:', err);
  }
}

/**
 * Get the active SW registration, waiting up to 15s for iOS.
 * iOS Safari takes much longer to activate SWs than other browsers.
 */
async function getActiveRegistration(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[push] SW activation timeout — trying navigator.serviceWorker.ready');
      navigator.serviceWorker.ready.then(resolve).catch(() => resolve(null));
    }, timeoutMs);

    navigator.serviceWorker.ready.then((reg) => {
      clearTimeout(timer);
      resolve(reg);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
