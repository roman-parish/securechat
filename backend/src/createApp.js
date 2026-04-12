/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import pushRoutes from './routes/push.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';
import errorRoutes from './routes/errors.js';

// Minimal mock io for tests — just stubs all emit/room methods
export const mockIo = {
  to: () => ({ emit: () => {} }),
  in: () => ({ fetchSockets: async () => [], emit: () => {} }),
  emit: () => {},
};

/**
 * Creates the Express app.
 *
 * `ioRef` can be:
 *   - a plain mock object (used in tests): req.io = ioRef
 *   - a ref object { current: io } (used in production): req.io = ioRef.current
 *
 * The ref pattern lets index.js call createApp() before the Socket.IO Server
 * is instantiated, then set ioRef.current = io afterwards — all before any
 * requests arrive, so middleware order stays correct.
 */
export function createApp(ioRef = mockIo) {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Relaxed rate limits in test environment
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Inject io into requests — resolves the ref lazily so index.js can set
  // ioRef.current after creating the Socket.IO server
  app.use((req, _res, next) => {
    req.io = ioRef.current !== undefined ? ioRef.current : ioRef;
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/errors', errorRoutes);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/uploads', express.static('/app/uploads'));

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });

  return app;
}
