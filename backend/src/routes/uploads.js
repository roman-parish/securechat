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

const storage = multer.diskStorage({
  destination: '/app/uploads',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain',
      'audio/webm', 'audio/ogg', 'audio/mpeg',
      'video/webm', 'video/mp4',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

// Upload file (encrypted at client side before upload)
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
  });
});

// Upload avatar
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
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

  // Broadcast avatar change to all connected clients
  req.io.emit('user:updated', {
    _id: updated._id,
    username: updated.username,
    displayName: updated.displayName,
    avatar: updated.avatar,
  });

  res.json({ avatar: `/uploads/${req.file.filename}` });
});

export default router;
