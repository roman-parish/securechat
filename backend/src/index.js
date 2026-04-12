/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import webpush from 'web-push';

import logger from './utils/logger.js';
import { validateEnv } from './utils/validateEnv.js';
import { connectDB } from './utils/db.js';
import { connectRedis } from './utils/redis.js';
import { setupSocketIO } from './utils/socket.js';
import { createApp } from './createApp.js';

// Validate required env vars before anything else
validateEnv(logger);

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

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost';

const httpServer = createServer();

const io = new Server(httpServer, {
  path: '/ws',
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Redis pub/sub adapter for multi-instance support
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();
pubClient.on('error', err => logger.error({ err }, 'Redis adapter pub error'));
subClient.on('error', err => logger.error({ err }, 'Redis adapter sub error'));
io.adapter(createAdapter(pubClient, subClient));
logger.info('Socket.IO Redis adapter configured');

const app = createApp(io);

// Pino HTTP logging + tighter auth rate limit (production only)
app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url === '/api/health' } }));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
}));

httpServer.on('request', app);

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
