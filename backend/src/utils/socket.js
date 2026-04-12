/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { setUserOnline, setUserOffline, isUserOnline, getOnlineUsers } from './redis.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import PushSubscription from '../models/PushSubscription.js';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@securechat.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
  return true;
}

export function setupSocketIO(io) {
  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.displayName = decoded.displayName || decoded.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`[socket] Connected: ${socket.username} (${socket.userId})`);

    await setUserOnline(socket.userId, socket.id);
    socket.join(`user:${socket.userId}`);
    socket.broadcast.emit('user:online', { userId: socket.userId });

    // Send the connecting client the full current online user list
    // so their UI is accurate immediately without waiting for individual events
    try {
      const onlineMap = await getOnlineUsers();
      const onlineIds = Object.keys(onlineMap || {});
      socket.emit('users:online-list', { userIds: onlineIds });
      console.log(`[socket] Sent online list (${onlineIds.length} users) to ${socket.username}`);
    } catch (err) {
      console.error('[socket] Failed to send online list:', err.message);
      // Send empty list so client knows the list was attempted
      socket.emit('users:online-list', { userIds: [] });
    }

    socket.on('conversation:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Track whether the app is visible — clients emit these on visibilitychange
    socket.on('app:background', () => {
      socket.data.appBackgrounded = true;
    });

    socket.on('app:foreground', () => {
      socket.data.appBackgrounded = false;
    });

    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        userId: socket.userId,
        username: socket.displayName || socket.username,
        conversationId,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        userId: socket.userId,
        conversationId,
      });
    });

    socket.on('message:read', ({ messageId, conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('message:read', {
        messageId,
        userId: socket.userId,
      });
    });

    socket.on('message:delivered', async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId).select('sender deliveredTo conversationId');
        if (!message) return;
        // Only mark delivered if not already in the array
        const alreadyDelivered = message.deliveredTo?.some(d => String(d.userId) === socket.userId);
        if (alreadyDelivered) return;
        await Message.findByIdAndUpdate(messageId, {
          $push: { deliveredTo: { userId: socket.userId, deliveredAt: new Date() } },
        });
        // Notify the sender so their tick updates
        io.to(`user:${message.sender}`).emit('message:delivered', {
          messageId,
          userId: socket.userId,
        });
      } catch (err) {
        console.error('[socket] message:delivered error:', err.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[socket] Disconnected: ${socket.username}`);
      await setUserOffline(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() });
      socket.broadcast.emit('user:offline', { userId: socket.userId, lastSeen: new Date() });
    });
  });
}

/**
 * Check if a user's socket connections are all backgrounded.
 * Returns true if the user has sockets but they all have appBackgrounded=true.
 */
export async function isUserBackgrounded(io, userId) {
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  if (!sockets.length) return false; // not connected at all
  return sockets.every(s => s.data.appBackgrounded === true);
}

/**
 * Send a push notification to all subscribed devices for a user.
 */
export async function sendPushToUser(userId, payload) {
  if (!ensureVapid()) return; // VAPID not configured

  try {
    const subscriptions = await PushSubscription.find({ userId });
    if (!subscriptions.length) return;

    console.log(`[push] Sending to ${subscriptions.length} device(s) for user ${userId}`);

    const payloadStr = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const endpoint = sub.subscription.endpoint.slice(0, 60);
          console.log(`[push] Attempting send to: ${endpoint}...`);
          await webpush.sendNotification(sub.subscription, payloadStr);
          console.log(`[push] ✅ Successfully sent to: ${endpoint}...`);
        } catch (err) {
          console.error(`[push] ❌ sendNotification failed:`);
          console.error(`[push]    statusCode: ${err.statusCode}`);
          console.error(`[push]    body: ${err.body}`);
          console.error(`[push]    message: ${err.message}`);
          console.error(`[push]    endpoint: ${sub.subscription.endpoint.slice(0, 60)}...`);
          // Remove dead subscriptions (410 = Gone, 404 = Not Found)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.deleteOne({ _id: sub._id });
            console.log('[push] Removed expired subscription');
          }
        }
      })
    );
  } catch (err) {
    console.error('[push] sendPushToUser error:', err);
  }
}
