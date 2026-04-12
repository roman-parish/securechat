/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
    default: 'direct',
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }],
  name: {
    type: String,
    maxlength: 100,
    default: null,
  },
  avatar: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    maxlength: 300,
    default: '',
  },
  hiddenFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },
  // Encrypted symmetric key per participant (for group chats)
  encryptedKeys: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    encryptedKey: String, // AES key encrypted with user's public key
  }],
  mutedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    until: { type: Date, default: null }, // null = muted indefinitely
  }],
  invitations: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
});

conversationSchema.index({ participants: 1, lastActivity: -1 });

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
