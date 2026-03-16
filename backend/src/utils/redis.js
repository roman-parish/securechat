/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/w5rcp-romanparish/securechat
 */
import Redis from 'ioredis';

let redisClient;

export async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redisClient.on('connect', () => console.log('✅ Redis connected'));
  redisClient.on('error', (err) => console.error('Redis error:', err));

  await redisClient.connect();
  return redisClient;
}

export { redisClient };

// Helper: store online user
export async function setUserOnline(userId, socketId) {
  await redisClient.hset('online_users', userId.toString(), socketId);
  await redisClient.expire('online_users', 86400);
}

export async function setUserOffline(userId) {
  await redisClient.hdel('online_users', userId.toString());
}

export async function getOnlineUsers() {
  return redisClient.hgetall('online_users') || {};
}

export async function isUserOnline(userId) {
  const result = await redisClient.hexists('online_users', userId.toString());
  return result === 1;
}

export async function getUserSocketId(userId) {
  return redisClient.hget('online_users', userId.toString());
}
