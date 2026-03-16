/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import PushSubscription from '../models/PushSubscription.js';
import webpush from 'web-push';

const router = Router();

function ensureVapid() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys not configured');
  }
  // setVapidDetails is idempotent — safe to call before every send
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@securechat.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// Get VAPID public key (unauthenticated — needed before login for SW setup)
router.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured on server' });
  res.json({ publicKey: key });
});

// Save or refresh a push subscription
router.post('/subscribe', authenticate, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Valid push subscription required' });
  }
  try {
    await PushSubscription.findOneAndUpdate(
      { userId: req.user.userId, 'subscription.endpoint': subscription.endpoint },
      {
        userId: req.user.userId,
        subscription,
        userAgent: req.headers['user-agent'],
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
    const ua = req.headers['user-agent'] || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    console.log(`[push] ✅ Subscription saved for user ${req.user.userId} (${isIOS ? 'iOS' : 'desktop'}) endpoint: ${subscription.endpoint.slice(0, 60)}...`);
    res.json({ success: true });
  } catch (err) {
    console.error('[push] Save subscription error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Remove a push subscription
router.delete('/subscribe', authenticate, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  try {
    await PushSubscription.deleteOne({
      userId: req.user.userId,
      'subscription.endpoint': endpoint,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// Send a test notification to all of this user's subscribed devices
router.post('/test', authenticate, async (req, res) => {
  try {
    ensureVapid();
  } catch {
    return res.status(503).json({ error: 'Push not configured — add VAPID keys to .env' });
  }

  const subscriptions = await PushSubscription.find({ userId: req.user.userId });
  if (!subscriptions.length) {
    return res.status(400).json({
      error: 'No subscriptions found. Enable notifications in Settings first.',
    });
  }

  console.log(`[push] Sending test to ${subscriptions.length} subscription(s) for user ${req.user.userId}`);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            type: 'test',
            title: 'SecureChat',
            body: '🔒 Push notifications are working!',
            url: '/',
          }),
        );
        console.log(`[push] Test sent to ${sub.subscription.endpoint.slice(0, 50)}...`);
      } catch (err) {
        console.error(`[push] Send failed (${err.statusCode}):`, err.body || err.message);
        // Clean up expired subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.log('[push] Removed expired subscription');
        }
        throw err;
      }
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  res.json({ sent, failed, total: subscriptions.length });
});

export default router;
