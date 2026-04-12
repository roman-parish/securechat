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
      .populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus')
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
    }).populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

    if (conversation) {
      return res.json(conversation);
    }

    conversation = new Conversation({
      type: 'direct',
      participants: [req.user.userId, userId],
    });
    await conversation.save();
    await conversation.populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

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
    await conversation.populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

    // Notify all participants
    allParticipants.forEach(pid => {
      req.io.to(`user:${pid}`).emit('conversation:new', conversation);
    });

    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get pending group invitations for current user
router.get('/invitations', authenticate, async (req, res) => {
  try {
    const convs = await Conversation.find({
      invitations: { $elemMatch: { userId: req.user.userId, status: 'pending' } },
    });
    const result = [];
    for (const conv of convs) {
      const inv = conv.invitations.find(
        i => String(i.userId) === req.user.userId && i.status === 'pending'
      );
      if (!inv) continue;
      const invitedBy = await User.findById(inv.invitedBy).select('username displayName avatar');
      result.push({
        _id: inv._id,
        conversationId: conv._id,
        conversationName: conv.name,
        invitedBy,
        createdAt: inv.createdAt,
      });
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

// Get conversation by ID
router.get('/:conversationId', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    }).populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

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
    ).populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');
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

// List pending invitations for a group — admins only
router.get('/:conversationId/invitations', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });

    const pending = conv.invitations.filter(i => i.status === 'pending');
    const result = await Promise.all(pending.map(async inv => {
      const invitee = await User.findById(inv.userId).select('username displayName avatar');
      const invitedBy = await User.findById(inv.invitedBy).select('username displayName');
      return { _id: inv._id, invitee, invitedBy, createdAt: inv.createdAt };
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to get group invitations' });
  }
});

// Invite a user to a group — admins only
router.post('/:conversationId/invite', authenticate, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });

    if (conv.participants.map(String).includes(String(userId))) {
      return res.status(400).json({ error: 'User is already in this group' });
    }
    const alreadyInvited = conv.invitations?.some(
      i => String(i.userId) === String(userId) && i.status === 'pending'
    );
    if (alreadyInvited) return res.status(400).json({ error: 'User already has a pending invitation' });

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $push: { invitations: { userId, invitedBy: req.user.userId } },
    });

    const invitedBy = await User.findById(req.user.userId).select('username displayName');
    req.io.to(`user:${userId}`).emit('invitation:new', {
      conversationId: conv._id,
      conversationName: conv.name,
      invitedBy,
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Accept a group invitation
router.post('/:conversationId/invitations/:invitationId/accept', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.conversationId });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const inv = conv.invitations.id(req.params.invitationId);
    if (!inv || String(inv.userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (inv.status !== 'pending') return res.status(400).json({ error: 'Invitation already responded to' });

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $set: { 'invitations.$[inv].status': 'accepted' },
      $addToSet: { participants: req.user.userId },
    }, { arrayFilters: [{ 'inv._id': inv._id }] });

    const updated = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

    // Tell existing room members someone joined
    req.io.to(`conversation:${conv._id}`).emit('conversation:participant-joined', {
      conversationId: String(conv._id),
      userId: req.user.userId,
    });
    // Send the full conversation to the new participant
    req.io.to(`user:${req.user.userId}`).emit('conversation:new', updated);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Decline a group invitation
router.post('/:conversationId/invitations/:invitationId/decline', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.conversationId });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const inv = conv.invitations.id(req.params.invitationId);
    if (!inv || String(inv.userId) !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $set: { 'invitations.$[inv].status': 'declined' },
    }, { arrayFilters: [{ 'inv._id': inv._id }] });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// Mute conversation
router.post('/:conversationId/mute', authenticate, async (req, res) => {
  const { until } = req.body; // optional ISO date string; omit for indefinite
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    // Remove any existing mute entry for this user then add fresh one
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $pull: { mutedBy: { userId: req.user.userId } },
    });
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $push: { mutedBy: { userId: req.user.userId, until: until ? new Date(until) : null } },
    });
    res.json({ success: true, muted: true });
  } catch {
    res.status(500).json({ error: 'Failed to mute conversation' });
  }
});

// Unmute conversation
router.delete('/:conversationId/mute', authenticate, async (req, res) => {
  try {
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $pull: { mutedBy: { userId: req.user.userId } },
    });
    res.json({ success: true, muted: false });
  } catch {
    res.status(500).json({ error: 'Failed to unmute conversation' });
  }
});

// Pin a message
router.post('/:conversationId/pin', authenticate, async (req, res) => {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });

    const updated = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { pinnedMessage: { messageId, pinnedBy: req.user.userId, pinnedAt: new Date() } },
      { new: true }
    ).populate('participants', 'username displayName avatar publicKey lastSeen bio customStatus');

    req.io.to(`conversation:${conv._id}`).emit('conversation:pinned', {
      conversationId: String(conv._id),
      messageId,
      pinnedBy: req.user.userId,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Unpin message
router.delete('/:conversationId/pin', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $unset: { pinnedMessage: '' },
    });

    req.io.to(`conversation:${conv._id}`).emit('conversation:unpinned', {
      conversationId: String(conv._id),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to unpin message' });
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
