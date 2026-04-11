/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = Router();

// Get all conversations for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.userId,
      hiddenFor: { $ne: req.user.userId },
    })
      .populate('participants', 'username displayName avatar publicKey lastSeen bio')
      .populate('lastMessage')
      .sort({ lastActivity: -1 });

    res.json(conversations);
  } catch {
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Create or get direct conversation
router.post('/direct', authenticate, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const otherUser = await User.findById(userId);
    if (!otherUser) return res.status(404).json({ error: 'User not found' });

    // Check if direct conversation already exists
    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [req.user.userId, userId], $size: 2 },
    }).populate('participants', 'username displayName avatar publicKey lastSeen bio');

    if (conversation) {
      return res.json(conversation);
    }

    conversation = new Conversation({
      type: 'direct',
      participants: [req.user.userId, userId],
    });
    await conversation.save();
    await conversation.populate('participants', 'username displayName avatar publicKey lastSeen bio');

    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Create group conversation
router.post('/group', authenticate, async (req, res) => {
  const { name, participantIds, description } = req.body;
  if (!name || !participantIds?.length) {
    return res.status(400).json({ error: 'Name and participants required' });
  }

  try {
    const allParticipants = [...new Set([req.user.userId, ...participantIds])];

    const conversation = new Conversation({
      type: 'group',
      name,
      description,
      participants: allParticipants,
      admins: [req.user.userId],
    });
    await conversation.save();
    await conversation.populate('participants', 'username displayName avatar publicKey lastSeen bio');

    // Notify all participants
    allParticipants.forEach(pid => {
      req.io.to(`user:${pid}`).emit('conversation:new', conversation);
    });

    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get conversation by ID
router.get('/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    }).populate('participants', 'username displayName avatar publicKey lastSeen bio');

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch {
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Add participants to group
router.post('/:conversationId/participants', authenticate, async (req, res) => {
  const { userIds } = req.body;
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });

    if (!conversation) return res.status(403).json({ error: 'Not authorized' });

    const existing = new Set(conversation.participants.map(String));
    const newIds = userIds.filter(id => !existing.has(String(id)));
    if (newIds.length === 0) return res.status(400).json({ error: 'All users are already in this group' });
    conversation.participants.push(...newIds);
    await conversation.save();
    res.json(conversation);
  } catch {
    res.status(500).json({ error: 'Failed to add participants' });
  }
});

// Update group (name, description) — admins only
router.put('/:conversationId', authenticate, async (req, res) => {
  const { name, description } = req.body;
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });
    const updated = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { ...(name && { name }), ...(description !== undefined && { description }) },
      { new: true }
    ).populate('participants', 'username displayName avatar publicKey lastSeen bio');
    req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
    for (const p of updated.participants) {
      req.io.to(`user:${p._id}`).emit('conversation:updated', updated);
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Remove participant from group — admins only
router.delete('/:conversationId/participants/:userId', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });
    const isAdmin = conv.admins.map(String).includes(req.params.userId);
    const isLastAdmin = isAdmin && conv.admins.length === 1;
    if (isLastAdmin) return res.status(400).json({ error: 'Cannot remove the only admin — promote another member first' });
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $pull: { participants: req.params.userId, admins: req.params.userId },
    });
    req.io.to(`user:${req.params.userId}`).emit('conversation:removed', {
      conversationId: req.params.conversationId,
    });
    req.io.to(`conversation:${conv._id}`).emit('conversation:participant-left', {
      conversationId: req.params.conversationId,
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// Hide conversation from list (for this user only — messages stay for others)
router.delete('/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    // Add user to hiddenFor array — keeps the convo for other participants
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $addToSet: { hiddenFor: req.user.userId },
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to hide conversation' });
  }
});

export default router;
