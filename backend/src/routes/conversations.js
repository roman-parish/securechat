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

const PARTICIPANT_FIELDS = 'username displayName avatar publicKey lastSeen hideLastSeen bio';

// Strip lastSeen from participants who have opted out of sharing it
function redactParticipants(participants, requestingUserId) {
  return participants.map(p => {
    const obj = p.toObject ? p.toObject() : { ...p };
    if (obj.hideLastSeen && String(obj._id) !== String(requestingUserId)) {
      obj.lastSeen = null;
    }
    delete obj.hideLastSeen;
    return obj;
  });
}

// Get all conversations for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const archived = req.query.archived === 'true';
    const query = {
      participants: req.user.userId,
      hiddenFor: { $ne: req.user.userId },
    };
    if (archived) {
      query.archivedBy = req.user.userId;
    } else {
      query.archivedBy = { $ne: req.user.userId };
    }

    const conversations = await Conversation.find(query)
      .populate('participants', PARTICIPANT_FIELDS)
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username displayName' } })
      .sort({ lastActivity: -1 });

    const result = conversations.map(conv => {
      const obj = conv.toObject();
      obj.participants = redactParticipants(conv.participants, req.user.userId);
      return obj;
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Archive a conversation
router.post('/:conversationId/archive', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.userId });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!conv.archivedBy.includes(req.user.userId)) {
      conv.archivedBy.push(req.user.userId);
      await conv.save();
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
});

// Unarchive a conversation
router.post('/:conversationId/unarchive', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.userId });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    conv.archivedBy = conv.archivedBy.filter(id => String(id) !== String(req.user.userId));
    await conv.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to unarchive conversation' });
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
    }).populate('participants', PARTICIPANT_FIELDS);

    if (conversation) {
      return res.json(conversation);
    }

    conversation = new Conversation({
      type: 'direct',
      participants: [req.user.userId, userId],
    });
    await conversation.save();
    await conversation.populate('participants', PARTICIPANT_FIELDS);

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
    // Only the creator joins immediately — everyone else gets an invitation
    const inviteeIds = [...new Set(participantIds.map(String))].filter(id => id !== String(req.user.userId));

    const invitations = inviteeIds.map(userId => ({
      userId,
      invitedBy: req.user.userId,
      status: 'pending',
    }));

    const conversation = new Conversation({
      type: 'group',
      name,
      description,
      participants: [req.user.userId],
      admins: [req.user.userId],
      invitations,
    });
    await conversation.save();
    await conversation.populate('participants', PARTICIPANT_FIELDS);

    // Notify the creator
    req.io.to(`user:${req.user.userId}`).emit('conversation:new', conversation);

    // Send invitation events to all invitees
    const invitedBy = await User.findById(req.user.userId).select('username displayName');
    inviteeIds.forEach(uid => {
      req.io.to(`user:${uid}`).emit('invitation:new', {
        conversationId: conversation._id,
        conversationName: conversation.name,
        invitedBy,
      });
    });

    res.status(201).json({ conversation, inviteCount: inviteeIds.length });
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
    }).populate('participants', PARTICIPANT_FIELDS);

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const obj = conversation.toObject();
    obj.participants = redactParticipants(conversation.participants, req.user.userId);
    res.json(obj);
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
    ).populate('participants', PARTICIPANT_FIELDS);
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
    const updated = await Conversation.findById(req.params.conversationId)
      .populate('participants', PARTICIPANT_FIELDS);
    // Tell the removed user their conversation is gone
    req.io.to(`user:${req.params.userId}`).emit('conversation:removed', {
      conversationId: req.params.conversationId,
    });
    // Update remaining members' participant lists in real-time
    req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
    for (const p of updated.participants) {
      req.io.to(`user:${String(p._id)}`).emit('conversation:updated', updated);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// Promote participant to admin — admins only
router.put('/:conversationId/admins/:userId', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
      participants: req.params.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized or user not in group' });
    if (conv.admins.map(String).includes(req.params.userId)) {
      return res.status(400).json({ error: 'User is already an admin' });
    }
    const updated = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { $addToSet: { admins: req.params.userId } },
      { new: true }
    ).populate('participants', PARTICIPANT_FIELDS);
    req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
    for (const p of updated.participants) {
      req.io.to(`user:${p._id}`).emit('conversation:updated', updated);
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to promote admin' });
  }
});

// Demote admin to regular member — admins only (cannot demote last admin)
router.delete('/:conversationId/admins/:userId', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conv) return res.status(403).json({ error: 'Not authorized' });
    if (conv.admins.length === 1 && conv.admins.map(String).includes(req.params.userId)) {
      return res.status(400).json({ error: 'Cannot demote the only admin' });
    }
    const updated = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { $pull: { admins: req.params.userId } },
      { new: true }
    ).populate('participants', PARTICIPANT_FIELDS);
    req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
    for (const p of updated.participants) {
      req.io.to(`user:${p._id}`).emit('conversation:updated', updated);
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to demote admin' });
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

    // Block check — don't allow inviting someone who has blocked the inviter or vice versa
    const inviter = await User.findById(req.user.userId).select('blockedUsers');
    const invitee = await User.findById(userId).select('blockedUsers');
    if (!invitee) return res.status(404).json({ error: 'User not found' });
    const inviterBlocked = inviter.blockedUsers.map(String).includes(String(userId));
    const inviteeBlocked = invitee.blockedUsers.map(String).includes(String(req.user.userId));
    if (inviterBlocked || inviteeBlocked) {
      return res.status(403).json({ error: 'Cannot invite this user' });
    }

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
      .populate('participants', PARTICIPANT_FIELDS);

    // Tell existing room members someone joined
    req.io.to(`conversation:${conv._id}`).emit('conversation:participant-joined', {
      conversationId: String(conv._id),
      userId: req.user.userId,
    });
    // Send the full conversation to the new participant
    req.io.to(`user:${req.user.userId}`).emit('conversation:new', updated);

    res.json(updated);
  } catch (err) {
    console.error('[conversations] accept invitation:', err);
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

// Update disappearing messages setting — admins only for groups, any participant for direct
router.put('/:conversationId/disappearing', authenticate, async (req, res) => {
  const { duration } = req.body; // seconds: 0=off, 3600=1h, 86400=1d, 604800=7d, 2592000=30d
  const allowed = [0, 3600, 86400, 604800, 2592000];
  if (!allowed.includes(Number(duration))) {
    return res.status(400).json({ error: 'Invalid duration' });
  }
  try {
    const conv = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.userId });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.type === 'group' && !conv.admins.map(String).includes(String(req.user.userId))) {
      return res.status(403).json({ error: 'Only admins can change this setting' });
    }
    const updated = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { disappearingMessages: Number(duration) },
      { new: true }
    ).populate('participants', PARTICIPANT_FIELDS);
    req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
    for (const p of updated.participants) {
      req.io.to(`user:${String(p._id)}`).emit('conversation:updated', updated);
    }
    res.json({ disappearingMessages: updated.disappearingMessages });
  } catch {
    res.status(500).json({ error: 'Failed to update disappearing messages' });
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

// Dissolve group — group admins only; deletes conversation and all messages for everyone
router.delete('/:conversationId/dissolve', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      admins: req.user.userId,
    });
    if (!conversation) return res.status(403).json({ error: 'Not found or not a group admin' });

    await Message.deleteMany({ conversationId: conversation._id });
    await Conversation.deleteOne({ _id: conversation._id });

    // Notify all participants so they remove it from their UI
    req.io.to(`conversation:${conversation._id}`).emit('conversation:removed', { conversationId: conversation._id });
    for (const pid of conversation.participants) {
      req.io.to(`user:${String(pid)}`).emit('conversation:removed', { conversationId: conversation._id });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Leave a group — removes self as participant
router.post('/:conversationId/leave', authenticate, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      type: 'group',
      participants: req.user.userId,
    });
    if (!conv) return res.status(404).json({ error: 'Group not found' });

    const isAdmin = conv.admins.map(String).includes(String(req.user.userId));
    const isLastAdmin = isAdmin && conv.admins.length === 1 && conv.participants.length > 1;
    if (isLastAdmin) {
      return res.status(400).json({ error: 'You are the only admin — promote another member before leaving' });
    }

    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      $pull: { participants: req.user.userId, admins: req.user.userId },
    });

    // Delete group if no participants remain
    const updated = await Conversation.findById(req.params.conversationId)
      .populate('participants', PARTICIPANT_FIELDS);
    if (updated && updated.participants.length === 0) {
      await Message.deleteMany({ conversationId: conv._id });
      await Conversation.deleteOne({ _id: conv._id });
    } else if (updated) {
      // Update remaining members' participant lists in real-time
      req.io.to(`conversation:${conv._id}`).emit('conversation:updated', updated);
      for (const p of updated.participants) {
        req.io.to(`user:${String(p._id)}`).emit('conversation:updated', updated);
      }
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to leave group' });
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
