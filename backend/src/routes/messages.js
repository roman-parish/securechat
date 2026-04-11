/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { isUserOnline } from '../utils/redis.js';
import { sendPushToUser, isUserBackgrounded } from '../utils/socket.js';
import User from '../models/User.js';

const router = Router();

// Broadcast to conversation room + every participant's personal room
function broadcastToConv(io, convId, participants, event, data) {
  io.to(`conversation:${convId}`).emit(event, data);
  for (const p of participants) {
    io.to(`user:${String(p._id || p)}`).emit(event, data);
  }
}

// Get messages for a conversation (paginated)
router.get('/:conversationId', authenticate, async (req, res) => {
  const { before, limit = 50 } = req.query;
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    });
    if (!conversation) return res.status(403).json({ error: 'Access denied' });

    const query = {
      conversationId: req.params.conversationId,
      deletedFor: { $ne: req.user.userId },
    };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .populate('sender', 'username displayName avatar')
      .populate('replyTo', 'sender encryptedContent encryptedKeys iv type')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100));

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/:conversationId', authenticate, async (req, res) => {
  const { encryptedContent, iv, encryptedKeys, type = 'text', replyTo, attachment } = req.body;
  if (!encryptedContent || !iv) return res.status(400).json({ error: 'Encrypted content and IV required' });
  if (!encryptedKeys?.length) return res.status(400).json({ error: 'encryptedKeys array is required' });

  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user.userId,
    }).populate('participants', 'username displayName publicKey');
    if (!conversation) return res.status(403).json({ error: 'Access denied' });

    const message = new Message({
      conversationId: conversation._id,
      sender: req.user.userId,
      encryptedContent, iv, encryptedKeys,
      type,
      replyTo: replyTo || null,
      attachment: attachment || undefined,
      readBy: [{ userId: req.user.userId }],
    });
    await message.save();
    await message.populate('sender', 'username displayName avatar');
    if (message.replyTo) {
      await message.populate('replyTo', 'sender encryptedContent encryptedKeys iv type');
    }

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      lastActivity: new Date(),
      // Un-hide for all participants when a new message arrives
      $set: { hiddenFor: [] },
    });

    broadcastToConv(req.io, conversation._id, conversation.participants, 'message:new', message);

    // Push to offline / backgrounded participants
    const sender = await User.findById(req.user.userId).select('displayName username');
    const others = conversation.participants.filter(p => p._id.toString() !== req.user.userId);

    for (const p of others) {
      const online = await isUserOnline(p._id);
      // Push if: fully offline, OR all their sockets are backgrounded, OR
      // they have no socket in this specific conversation room (not actively viewing it)
      let shouldPush = false;
      if (!online) {
        shouldPush = true;
      } else {
        const userSockets = await req.io.in(`user:${p._id}`).fetchSockets();
        if (userSockets.length === 0) {
          shouldPush = true; // redis thinks online but socket is gone
        } else {
          const allBackgrounded = userSockets.every(s => s.appBackgrounded === true);
          const inConvRoom = await req.io.in(`conversation:${conversation._id}`).fetchSockets()
            .then(sockets => sockets.some(s => s.userId === p._id.toString()));
          shouldPush = allBackgrounded || !inConvRoom;
        }
      }
      const mutedEntry = conversation.mutedBy?.find(m => String(m.userId) === String(p._id));
      const isMuted = mutedEntry && (!mutedEntry.until || new Date(mutedEntry.until) > new Date());
      if (shouldPush && !isMuted) {
        await sendPushToUser(p._id, {
          type: 'new_message',
          title: conversation.type === 'group' ? conversation.name : sender.displayName || sender.username,
          body: conversation.type === 'group'
            ? `${sender.displayName || sender.username}: New message`
            : 'New message',
          conversationId: conversation._id.toString(),
          url: '/',
        });
      }
    }

    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark messages as read — emit read receipts
router.post('/:conversationId/read', authenticate, async (req, res) => {
  try {
    const unread = await Message.find({
      conversationId: req.params.conversationId,
      'readBy.userId': { $ne: req.user.userId },
      sender: { $ne: req.user.userId },
    }).select('_id conversationId');

    if (unread.length) {
      await Message.updateMany(
        { _id: { $in: unread.map(m => m._id) } },
        { $push: { readBy: { userId: req.user.userId, readAt: new Date() } } },
      );

      const conversation = await Conversation.findById(req.params.conversationId).select('participants');
      if (conversation) {
        broadcastToConv(req.io, req.params.conversationId, conversation.participants, 'messages:read', {
          conversationId: req.params.conversationId,
          userId: req.user.userId,
          messageIds: unread.map(m => String(m._id)),
        });
      }
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Edit message (sender only, within 15 minutes)
router.put('/:messageId', authenticate, async (req, res) => {
  const { encryptedContent, iv, encryptedKeys } = req.body;
  try {
    const message = await Message.findOne({ _id: req.params.messageId, sender: req.user.userId });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > 15 * 60 * 1000) return res.status(403).json({ error: 'Cannot edit messages older than 15 minutes' });

    message.encryptedContent = encryptedContent;
    message.iv = iv;
    message.encryptedKeys = encryptedKeys;
    message.editedAt = new Date();
    await message.save();
    await message.populate('sender', 'username displayName avatar');

    const conv = await Conversation.findById(message.conversationId).select('participants');
    if (conv) broadcastToConv(req.io, message.conversationId, conv.participants, 'message:edited', message);

    res.json(message);
  } catch {
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete message for everyone (sender only) or just for me
router.delete('/:messageId', authenticate, async (req, res) => {
  const { forEveryone } = req.query;
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isSender = String(message.sender) === req.user.userId;

    if (forEveryone === 'true' && isSender) {
      // Delete for everyone
      await Message.findByIdAndUpdate(req.params.messageId, {
        encryptedContent: '',
        iv: '',
        encryptedKeys: [],
        type: 'deleted',
      });
      const conv = await Conversation.findById(message.conversationId).select('participants');
      if (conv) broadcastToConv(req.io, message.conversationId, conv.participants, 'message:deleted', {
        messageId: req.params.messageId,
        conversationId: String(message.conversationId),
        forEveryone: true,
      });
    } else {
      // Delete just for me
      await Message.findByIdAndUpdate(req.params.messageId, {
        $addToSet: { deletedFor: req.user.userId },
      });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Toggle reaction (add or remove)
router.post('/:messageId/react', authenticate, async (req, res) => {
  const { emoji } = req.body;
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const existing = message.reactions.find(
      r => r.emoji === emoji && String(r.userId) === req.user.userId
    );

    if (existing) {
      // Toggle off
      await Message.findByIdAndUpdate(req.params.messageId, {
        $pull: { reactions: { emoji, userId: req.user.userId } },
      });
    } else {
      await Message.findByIdAndUpdate(req.params.messageId, {
        $push: { reactions: { emoji, userId: req.user.userId } },
      });
    }

    const updated = await Message.findById(req.params.messageId);
    const conv = await Conversation.findById(message.conversationId).select('participants');
    if (conv) {
      broadcastToConv(req.io, message.conversationId, conv.participants, 'message:reaction', {
        messageId: String(message._id),
        reactions: updated.reactions,
      });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update reaction' });
  }
});

export default router;
