/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

// Encrypted message attachments — stored without any extension so the stored
// filename is never influenced by client input. Served exclusively as
// application/octet-stream via /api/uploads/secure/:filename (auth-gated).
const attachmentStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, _file, cb) => cb(null, uuidv4()),
});

const upload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Content is E2E-encrypted before upload so the MIME type is informational
    // only. Block obviously wrong types but don't reject browser variations of
    // octet-stream (e.g. "application/octet-stream; charset=utf-8").
    const blocked = ['text/html', 'text/javascript', 'application/javascript', 'image/svg+xml'];
    if (blocked.includes(file.mimetype.split(';')[0].trim())) {
      cb(new Error('File type not allowed'));
    } else {
      cb(null, true);
    }
  },
});

// Avatar uploads — image-only, extension derived from a server-side whitelist
// (never from the client-supplied filename).
const SAFE_IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const avatarStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = SAFE_IMAGE_EXT[file.mimetype] ?? '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — avatars don't need more
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(SAFE_IMAGE_EXT, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, or WebP allowed for avatars'));
    }
  },
});

// Serve message attachment — requires valid session, always octet-stream (content is encrypted)
router.get('/secure/:filename', authenticate, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Type', 'application/octet-stream');
  res.sendFile(filePath);
});

// Upload file (encrypted at client side before upload)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    url: `/api/uploads/secure/${req.file.filename}`,
  });
});

// Upload avatar
router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Import User model dynamically to avoid circular deps
  const { default: User } = await import('../models/User.js');
  const user = await User.findById(req.user.userId);

  // Delete old avatar
  if (user.avatar) {
    const oldPath = `/app/uploads/${path.basename(user.avatar)}`;
    try { fs.unlinkSync(oldPath); } catch {}
  }

  const updated = await User.findByIdAndUpdate(
    req.user.userId,
    { avatar: `/uploads/${req.file.filename}` },
    { new: true },
  );

  // Broadcast only to users who share a conversation with this user
  const { default: Conversation } = await import('../models/Conversation.js');
  const convs = await Conversation.find({ participants: updated._id }).select('_id').lean();
  const payload = { _id: updated._id, username: updated.username, displayName: updated.displayName, avatar: updated.avatar };
  req.io.to(`user:${updated._id}`).emit('user:updated', payload);
  for (const conv of convs) {
    req.io.to(`conversation:${conv._id}`).emit('user:updated', payload);
  }

  res.json({ avatar: `/uploads/${req.file.filename}` });
});

export default router;
