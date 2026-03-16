/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true,
    trim: true, minlength: 3, maxlength: 30,
    match: /^[a-zA-Z0-9_]+$/,
  },
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true,
  },
  password: { type: String, required: true, minlength: 8 },
  displayName: { type: String, maxlength: 50 },
  avatar: { type: String, default: null },
  bio: { type: String, maxlength: 200, default: '' },

  // E2E encryption key material
  publicKey: { type: String, default: null },
  // Encrypted private key — safe to store server-side, useless without password
  encryptedPrivateKey: { type: String, default: null },
  // PBKDF2 salt used to derive the wrapping key
  keyDerivationSalt: { type: String, default: null },
  // AES-GCM IV used to wrap the private key
  keyWrapIv: { type: String, default: null },

  lastSeen: { type: Date, default: Date.now },
  banned: { type: Boolean, default: false },
  customStatus: { type: String, maxlength: 100, default: '' },
  refreshTokens: [String],
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.password;
      delete ret.refreshTokens;
      return ret;
    },
  },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.displayName) this.displayName = this.username;
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);
