/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import PushSubscription from '../models/PushSubscription.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { sendLoginNotification, sendPasswordChangedNotification, sendAccountDeletedNotification, sendPasswordResetEmail, sendTwoFactorDisabledNotification } from '../utils/email.js';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';

const router = Router();

// Generate 10 recovery codes, return plaintext + store hashed versions
function generateRecoveryCodes() {
  const plain = Array.from({ length: 10 }, () => {
    const bytes = randomBytes(4).toString('hex').toUpperCase();
    return `${bytes.slice(0, 4)}-${bytes.slice(4)}`;
  });
  const hashed = plain.map(code => ({
    code: createHash('sha256').update(code).digest('hex'),
    used: false,
  }));
  return { plain, hashed };
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(code.replace(/\s/g, '').toUpperCase()).digest('hex');
}

const TRUSTED_DEVICE_COOKIE = 'sc_trusted';

function generateTokens(user) {
  const base = { userId: user._id.toString(), username: user.username, displayName: user.displayName || user.username };
  const accessToken = jwt.sign({ ...base, jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshJti = randomUUID();
  const refreshToken = jwt.sign({ ...base, jti: refreshJti }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken, refreshJti };
}

// Register — step 1: create account, get user ID back
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password } = req.body;
  try {
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const user = new User({ username, email, password, displayName: username });
    await user.save();

    const { accessToken, refreshToken, refreshJti } = generateTokens(user);
    user.refreshTokens.push({ jti: refreshJti, userAgent: req.headers['user-agent'], ip: req.ip, createdAt: new Date(), lastUsed: new Date() });
    await user.save();

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    logger.error({ err }, 'Registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login — returns encrypted key material so client can unwrap private key
router.post('/login', [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ username }, { email: username.toLowerCase() }],
    }).select('+password +refreshTokens');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.banned) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact an administrator.' });
    }

    // If 2FA is enabled, check for trusted device cookie before prompting
    if (user.twoFactorEnabled) {
      const trustedToken = req.body.trustedToken;
      const userWithTrusted = await User.findById(user._id).select('+trustedDevices');
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const isTrusted = trustedToken && userWithTrusted.trustedDevices.some(
        d => d.token === trustedToken && d.createdAt > cutoff
      );
      if (!isTrusted) {
        const tempToken = jwt.sign(
          { userId: String(user._id), purpose: '2fa' },
          process.env.JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({ requiresTwoFactor: true, tempToken });
      }
    }

    const { accessToken, refreshToken, refreshJti } = generateTokens(user);
    user.refreshTokens.push({ jti: refreshJti, userAgent: req.headers['user-agent'], ip: req.ip, createdAt: new Date(), lastUsed: new Date() });
    if (user.refreshTokens.length > 5) user.refreshTokens = user.refreshTokens.slice(-5);
    await user.save();

    // Login notification — fire and forget, don't block response
    if (user.email) {
      sendLoginNotification({
        to: user.email,
        displayName: user.displayName || user.username,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown device',
        time: new Date().toUTCString(),
      }).catch(() => {});
    }

    // Return full key material so client can restore keypair
    res.json({
      user,
      accessToken,
      refreshToken,
      keyMaterial: user.encryptedPrivateKey ? {
        encryptedPrivateKey: user.encryptedPrivateKey,
        salt: user.keyDerivationSalt,
        wrapIv: user.keyWrapIv,
        publicKey: user.publicKey,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, 'Login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Save encrypted key material after registration
router.post('/keys', authenticate, async (req, res) => {
  const { publicKey, encryptedPrivateKey, salt, wrapIv } = req.body;
  if (!publicKey || !encryptedPrivateKey || !salt || !wrapIv) {
    return res.status(400).json({ error: 'All key fields required' });
  }
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      publicKey,
      encryptedPrivateKey,
      keyDerivationSalt: salt,
      keyWrapIv: wrapIv,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save keys' });
  }
});

// Update public key only (legacy compatibility)
router.put('/public-key', authenticate, async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
  await User.findByIdAndUpdate(req.user.userId, { publicKey });
  res.json({ success: true });
});

// Refresh token — with reuse detection
// If a valid JWT arrives that is no longer in the stored array, it was already
// rotated — this indicates a stolen token. Clear all sessions immediately.
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId).select('+refreshTokens');
    if (!user) return res.status(401).json({ error: 'Invalid refresh token' });

    const session = user.refreshTokens.find(s => s.jti === decoded.jti);
    if (!session) {
      // Valid signature but jti not in sessions — token already rotated, possible theft
      logger.warn({ userId: decoded.userId }, 'Refresh token reuse detected — revoking all sessions');
      user.refreshTokens = [];
      await user.save();
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken, refreshJti: newJti } = generateTokens(user);
    user.refreshTokens = user.refreshTokens.filter(s => s.jti !== decoded.jti);
    user.refreshTokens.push({ jti: newJti, userAgent: session.userAgent, ip: session.ip, createdAt: session.createdAt, lastUsed: new Date() });
    await user.save();
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const user = await User.findById(req.user.userId).select('+refreshTokens');
    if (user && refreshToken) {
      const decoded = jwt.decode(refreshToken);
      user.refreshTokens = user.refreshTokens.filter(s => s.jti !== decoded?.jti);
      await user.save();
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Delete account
router.delete('/account', authenticate, async (req, res) => {
  const { password, twoFactorCode } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required to delete account' });

  try {
    const user = await User.findById(req.user.userId).select('+password +twoFactorSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) return res.status(403).json({ error: 'Two-factor code required', requiresTwoFactor: true });
      const totpValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: twoFactorCode.replace(/\s/g, ''), window: 1 });
      if (!totpValid) return res.status(401).json({ error: 'Invalid two-factor code' });
    }

    const userId = req.user.userId;

    // Anonymize messages — keep conversations intact for other participants
    await Message.updateMany(
      { sender: userId },
      { $set: { 'sender': null, deletedForEveryone: true, contentType: 'deleted' } }
    );

    // Remove user from all conversations; delete conversations that become empty
    const conversations = await Conversation.find({ participants: userId });
    for (const conv of conversations) {
      const remaining = conv.participants.filter(p => String(p) !== userId);
      if (remaining.length === 0) {
        await Conversation.deleteOne({ _id: conv._id });
        await Message.deleteMany({ conversationId: conv._id });
      } else {
        await Conversation.findByIdAndUpdate(conv._id, {
          $pull: { participants: userId, admins: userId },
        });
      }
    }

    // Delete push subscriptions
    await PushSubscription.deleteMany({ userId });

    // Send deletion confirmation before wiping the user doc
    if (user.email) {
      await sendAccountDeletedNotification({
        to: user.email,
        displayName: user.displayName || user.username,
      }).catch(() => {});
    }

    // Delete the user
    await User.deleteOne({ _id: userId });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Account deletion failed');
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// List active sessions
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('+refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const sessions = (user.refreshTokens || [])
      .filter(s => s.jti) // skip any legacy string entries
      .map(s => ({ jti: s.jti, createdAt: s.createdAt, lastUsed: s.lastUsed, userAgent: s.userAgent, ip: s.ip }));
    res.json(sessions);
  } catch {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Revoke a specific session
router.delete('/sessions/:jti', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('+refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.refreshTokens = user.refreshTokens.filter(s => s.jti !== req.params.jti);
    await user.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword, twoFactorCode } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  try {
    const user = await User.findById(req.user.userId).select('+password +twoFactorSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) return res.status(403).json({ error: 'Two-factor code required', requiresTwoFactor: true });
      const totpValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: twoFactorCode.replace(/\s/g, ''), window: 1 });
      if (!totpValid) return res.status(401).json({ error: 'Invalid two-factor code' });
    }

    user.password = newPassword;
    // Clear all refresh tokens to log out other sessions
    user.refreshTokens = [];
    await user.save();

    if (user.email) {
      sendPasswordChangedNotification({
        to: user.email,
        displayName: user.displayName || user.username,
        time: new Date().toUTCString(),
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Password change failed');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Complete login with TOTP code (after password succeeded)
router.post('/2fa/authenticate', async (req, res) => {
  const { tempToken, code, trustDevice } = req.body;
  if (!tempToken || !code) return res.status(400).json({ error: 'Token and code required' });
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (decoded.purpose !== '2fa') return res.status(401).json({ error: 'Invalid token' });

    const user = await User.findById(decoded.userId).select('+twoFactorSecret +twoFactorRecoveryCodes +refreshTokens +trustedDevices');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Try TOTP first, then recovery code
    const totpValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });

    let usedRecovery = false;
    if (!totpValid) {
      const hashed = hashRecoveryCode(code);
      const recoveryEntry = user.twoFactorRecoveryCodes.find(r => r.code === hashed && !r.used);
      if (!recoveryEntry) return res.status(401).json({ error: 'Invalid code' });
      recoveryEntry.used = true;
      usedRecovery = true;
    }

    const { accessToken, refreshToken, refreshJti } = generateTokens(user);
    user.refreshTokens.push({ jti: refreshJti, userAgent: req.headers['user-agent'], ip: req.ip, createdAt: new Date(), lastUsed: new Date() });
    if (user.refreshTokens.length > 5) user.refreshTokens = user.refreshTokens.slice(-5);

    // Trust this device for 30 days
    let trustedToken = null;
    if (trustDevice) {
      trustedToken = randomBytes(32).toString('hex');
      user.trustedDevices.push({ token: trustedToken, userAgent: req.headers['user-agent'] });
      // Expire old trusted devices after 30 days
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      user.trustedDevices = user.trustedDevices.filter(d => d.createdAt > cutoff);
    }

    await user.save();

    if (user.email) {
      sendLoginNotification({
        to: user.email,
        displayName: user.displayName || user.username,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'Unknown device',
        time: new Date().toUTCString(),
      }).catch(() => {});
    }

    const remainingCodes = user.twoFactorRecoveryCodes.filter(r => !r.used).length;

    const response = {
      user,
      accessToken,
      refreshToken,
      keyMaterial: user.encryptedPrivateKey ? {
        encryptedPrivateKey: user.encryptedPrivateKey,
        salt: user.keyDerivationSalt,
        wrapIv: user.keyWrapIv,
        publicKey: user.publicKey,
      } : null,
      ...(usedRecovery && { recoveryCodeUsed: true, remainingRecoveryCodes: remainingCodes }),
      ...(trustedToken && { trustedToken }),
    };

    res.json(response);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Code expired — please log in again' });
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Generate 2FA secret and QR code (user must confirm before it's enabled)
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.twoFactorEnabled) return res.status(400).json({ error: '2FA is already enabled' });

    const secret = speakeasy.generateSecret({
      name: `SecureChat (${user.username})`,
      issuer: 'SecureChat',
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrCode: qrCodeUrl, secret: secret.base32 });
  } catch {
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// Confirm 2FA setup — activates 2FA and returns one-time recovery codes
router.post('/2fa/confirm', authenticate, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const user = await User.findById(req.user.userId).select('+twoFactorSecret +twoFactorRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.twoFactorSecret) return res.status(400).json({ error: 'Run 2FA setup first' });

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Invalid code — check your authenticator app' });

    const { plain, hashed } = generateRecoveryCodes();
    user.twoFactorEnabled = true;
    user.twoFactorRecoveryCodes = hashed;
    await user.save();

    // Return plaintext codes once — never stored in plaintext
    res.json({ success: true, recoveryCodes: plain });
  } catch {
    res.status(500).json({ error: 'Failed to confirm 2FA' });
  }
});

// Regenerate recovery codes — requires current TOTP code
router.post('/2fa/recovery-codes', authenticate, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const user = await User.findById(req.user.userId).select('+twoFactorSecret +twoFactorRecoveryCodes');
    if (!user || !user.twoFactorEnabled) return res.status(400).json({ error: '2FA is not enabled' });

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Invalid code' });

    const { plain, hashed } = generateRecoveryCodes();
    user.twoFactorRecoveryCodes = hashed;
    await user.save();

    res.json({ recoveryCodes: plain });
  } catch {
    res.status(500).json({ error: 'Failed to regenerate recovery codes' });
  }
});

// Get remaining recovery code count
router.get('/2fa/recovery-codes/count', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('+twoFactorRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const remaining = user.twoFactorRecoveryCodes.filter(r => !r.used).length;
    res.json({ remaining });
  } catch {
    res.status(500).json({ error: 'Failed to get recovery code count' });
  }
});

// Disable 2FA — requires current TOTP code to confirm
router.post('/2fa/disable', authenticate, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const user = await User.findById(req.user.userId).select('+twoFactorSecret +twoFactorRecoveryCodes');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.twoFactorEnabled) return res.status(400).json({ error: '2FA is not enabled' });

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!valid) return res.status(401).json({ error: 'Invalid code' });

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorRecoveryCodes = [];
    user.trustedDevices = [];
    await user.save();

    if (user.email) {
      sendTwoFactorDisabledNotification({
        to: user.email,
        displayName: user.displayName || user.username,
        time: new Date().toUTCString(),
      });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Forgot password — send reset link to email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordResetToken +passwordResetExpires');
    // Always respond success to prevent email enumeration
    if (!user) return res.json({ success: true });

    const token = randomBytes(32).toString('hex');
    user.passwordResetToken = createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/?reset=${token}`;
    await sendPasswordResetEmail({
      to: user.email,
      displayName: user.displayName || user.username,
      resetUrl,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Forgot password failed');
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// Reset password using token from email
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+password +refreshTokens +passwordResetToken +passwordResetExpires');

    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokens = []; // log out all devices
    await user.save();

    if (user.email) {
      sendPasswordChangedNotification({
        to: user.email,
        displayName: user.displayName || user.username,
        time: new Date().toUTCString(),
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Reset password failed');
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
