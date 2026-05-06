/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { isUserOnline } from '../utils/redis.js';

const router = Router();

// Current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Search users
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

  try {
    const me = await User.findById(req.user.userId).select('blockedUsers');
    const blocked = me?.blockedUsers || [];

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      $or: [
        { username: { $regex: escaped, $options: 'i' } },
        { displayName: { $regex: escaped, $options: 'i' } },
      ],
      _id: { $ne: req.user.userId, $nin: blocked },
      blockedUsers: { $ne: req.user.userId },
    }).limit(20).select('username displayName avatar publicKey lastSeen');

    const usersWithStatus = await Promise.all(users.map(async (user) => {
      const online = await isUserOnline(user._id);
      return { ...user.toObject(), isOnline: online };
    }));

    res.json(usersWithStatus);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get user profile
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username displayName avatar bio publicKey lastSeen');

    if (!user) return res.status(404).json({ error: 'User not found' });

    const isOnline = await isUserOnline(user._id);
    res.json({ ...user.toObject(), isOnline });
  } catch {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update own profile
router.put('/me/profile', authenticate, async (req, res) => {
  const { displayName, bio, hideLastSeen } = req.body;
  try {
    const update = { displayName, bio };
    if (typeof hideLastSeen === 'boolean') update.hideLastSeen = hideLastSeen;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      update,
      { new: true, runValidators: true },
    );
    // Broadcast only to users who share a conversation with this user
    const convs = await Conversation.find({ participants: user._id }).select('_id').lean();
    const payload = { _id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio };
    req.io.to(`user:${user._id}`).emit('user:updated', payload);
    for (const conv of convs) {
      req.io.to(`conversation:${conv._id}`).emit('user:updated', payload);
    }
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get current user
router.get('/me/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Get blocked users list
router.get('/me/blocked', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('blockedUsers', 'username displayName avatar');
    res.json(user?.blockedUsers || []);
  } catch {
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
});

// Block a user
router.post('/:userId/block', authenticate, async (req, res) => {
  if (req.params.userId === req.user.userId) return res.status(400).json({ error: 'Cannot block yourself' });
  try {
    await User.findByIdAndUpdate(req.user.userId, { $addToSet: { blockedUsers: req.params.userId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock a user
router.delete('/:userId/block', authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { $pull: { blockedUsers: req.params.userId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

export default router;
