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
import logger from '../utils/logger.js';

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
    logger.info({ userId: req.user.userId, platform: isIOS ? 'iOS' : 'desktop', endpoint: subscription.endpoint.slice(0, 60) }, 'Push subscription saved');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to save push subscription');
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

  logger.info({ userId: req.user.userId, count: subscriptions.length }, 'Sending test push notifications');

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
        logger.debug({ endpoint: sub.subscription.endpoint.slice(0, 50) }, 'Test push sent');
      } catch (err) {
        logger.error({ endpoint: sub.subscription.endpoint.slice(0, 50), statusCode: err.statusCode }, 'Test push failed');
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
          logger.info({ endpoint: sub.subscription.endpoint.slice(0, 50) }, 'Removed expired push subscription');
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
