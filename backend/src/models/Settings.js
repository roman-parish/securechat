/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  registrationOpen: { type: Boolean, default: true },
  email: {
    enabled:           { type: Boolean, default: true },
    loginNotification: { type: Boolean, default: true },
    passwordChanged:   { type: Boolean, default: true },
    securityAlerts:    { type: Boolean, default: true },
  },
}, { timestamps: true });

export default mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
