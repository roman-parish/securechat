/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import bcrypt from 'bcryptjs';

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalMessages, totalConversations] = await Promise.all([
      User.countDocuments(),
      // Only count non-deleted messages
      Message.countDocuments({ type: { $ne: 'deleted' } }),
      Conversation.countDocuments(),
    ]);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeToday = await User.countDocuments({ lastSeen: { $gte: oneDayAgo } });

    res.json({ totalUsers, totalMessages, totalConversations, activeToday });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 100 } = req.query;
    const query = search
      ? { $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
        ]}
      : {};

    const users = await User.find(query)
      .select('username email displayName avatar lastSeen createdAt banned')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await User.countDocuments(query);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:userId/ban
router.put('/users/:userId/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user._id) === String(req.user.userId)) {
      return res.status(400).json({ error: 'Cannot ban yourself' });
    }

    user.banned = !user.banned;
    await user.save();

    if (user.banned) {
      await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: [] } });
    }

    res.json({ banned: user.banned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

// PUT /api/admin/users/:userId/reset-password
router.put('/users/:userId/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await User.findById(req.params.userId).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword; // pre-save hook will hash it
    user.refreshTokens = []; // force logout all sessions
    await user.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user._id) === String(req.user.userId)) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Find all conversations this user was part of
    const convIds = await Conversation.find({ participants: user._id }).distinct('_id');

    // Delete all messages in those conversations
    await Message.deleteMany({ conversationId: { $in: convIds } });

    // Delete the conversations
    await Conversation.deleteMany({ participants: user._id });

    // Delete any remaining messages sent by user in other convos
    await Message.deleteMany({ sender: user._id });

    // Delete the user
    await User.findByIdAndDelete(user._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
