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
import Settings from '../models/Settings.js';
import Invite from '../models/Invite.js';
import AuditLog from '../models/AuditLog.js';
import { sendInviteEmail } from '../utils/email.js';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';

async function audit(req, action, targetUser = null, metadata = {}) {
  try {
    await AuditLog.create({
      action,
      performedBy: req.user.userId,
      performedByUsername: req.user.username || 'admin',
      targetUser: targetUser?._id || null,
      targetUsername: targetUser?.username || null,
      metadata,
    });
  } catch {}
}

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalMessages, totalConversations, activeToday, newUsersThisWeek, storageResult] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments({ type: { $ne: 'deleted' } }),
      Conversation.countDocuments(),
      User.countDocuments({ lastSeen: { $gte: oneDayAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      // Sum of all attachment sizes in bytes
      Message.aggregate([
        { $match: { 'attachment.size': { $exists: true } } },
        { $group: { _id: null, total: { $sum: '$attachment.size' } } },
      ]),
    ]);

    const storageBytes = storageResult[0]?.total || 0;

    res.json({
      totalUsers,
      totalMessages,
      totalConversations,
      activeToday,
      newUsersThisWeek,
      storageBytes,
    });
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
      .select('username email displayName avatar lastSeen createdAt banned twoFactorEnabled')
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

    await audit(req, user.banned ? 'user.ban' : 'user.unban', user);
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

    await audit(req, 'user.password_reset', user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PUT /api/admin/users/:userId/reset-2fa
router.put('/users/:userId/reset-2fa', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();
    await audit(req, 'user.reset_2fa', user);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reset 2FA' });
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

    await audit(req, 'user.delete', user);
    await User.findByIdAndDelete(user._id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/invites
router.get('/invites', async (req, res) => {
  try {
    const invites = await Invite.find({ usedAt: null, expiresAt: { $gt: new Date() } })
      .populate('createdBy', 'username displayName')
      .sort({ createdAt: -1 });
    res.json({ invites });
  } catch {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// POST /api/admin/invites
router.post('/invites', async (req, res) => {
  try {
    const { email, expiryHours = 24 } = req.body;
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const invite = await Invite.create({
      tokenHash,
      email: email || null,
      createdBy: req.user.userId,
      expiresAt,
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost';
    const inviteUrl = `${clientUrl}/?invite=${token}`;

    if (email) {
      sendInviteEmail({ to: email, inviteUrl, expiresAt });
    }

    await audit(req, 'invite.create', null, { email: email || null, expiryHours, inviteId: invite._id });
    res.json({ invite: { ...invite.toObject(), token }, inviteUrl });
  } catch {
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// DELETE /api/admin/invites/:id
router.delete('/invites/:id', async (req, res) => {
  try {
    const invite = await Invite.findById(req.params.id);
    await Invite.findByIdAndDelete(req.params.id);
    await audit(req, 'invite.revoke', null, { email: invite?.email || null, inviteId: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// GET /api/admin/audit
router.get('/audit', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await AuditLog.countDocuments();
    res.json({ logs, total });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await Settings.findOne() || { registrationOpen: true };
    res.json({ registrationOpen: settings.registrationOpen });
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/admin/settings
router.put('/settings', async (req, res) => {
  try {
    const { registrationOpen } = req.body;
    if (typeof registrationOpen !== 'boolean') {
      return res.status(400).json({ error: 'registrationOpen must be a boolean' });
    }
    const settings = await Settings.findOneAndUpdate(
      {},
      { registrationOpen },
      { upsert: true, new: true }
    );
    await audit(req, 'settings.registration_toggle', null, { registrationOpen });
    res.json({ registrationOpen: settings.registrationOpen });
  } catch {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
