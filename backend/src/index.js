/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import { validateEnv } from './utils/validateEnv.js';

// Validate required env vars before anything else
validateEnv(logger);

import webpush from 'web-push';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { connectDB } from './utils/db.js';
import { connectRedis, redisClient } from './utils/redis.js';
import { setupSocketIO } from './utils/socket.js';

// Initialize VAPID once at startup so every call to sendPushToUser
// uses the same pre-configured webpush instance
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@securechat.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  logger.info('VAPID push notifications configured');
} else {
  logger.warn('VAPID keys not set — push notifications disabled');
}

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import pushRoutes from './routes/push.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Trust the Nginx reverse proxy — required for rate limiting and X-Forwarded-For to work correctly
app.set('trust proxy', 1);
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost';

const io = new Server(httpServer, {
  path: '/ws',
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // handled by nginx
}));

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));

app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

// Make io available to routes
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static uploads
app.use('/uploads', express.static('/app/uploads'));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Redis pub/sub adapter — enables Socket.IO to work across multiple backend instances
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();
pubClient.on('error', err => logger.error({ err }, 'Redis adapter pub error'));
subClient.on('error', err => logger.error({ err }, 'Redis adapter sub error'));
io.adapter(createAdapter(pubClient, subClient));
logger.info('Socket.IO Redis adapter configured');

// Setup Socket.IO handlers
setupSocketIO(io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectDB();
    await connectRedis();
    httpServer.listen(PORT, () => {
      logger.info({ port: PORT }, 'SecureChat backend running');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { io, logger };
