import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { vi } from 'vitest';

let mongod;

// Mock the Redis module — tests don't need real pub/sub or presence tracking
vi.mock('../src/utils/redis.js', () => ({
  connectRedis: vi.fn().mockResolvedValue(undefined),
  redisClient: {
    hset: vi.fn().mockResolvedValue(1),
    hdel: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),
    hexists: vi.fn().mockResolvedValue(0),
    hget: vi.fn().mockResolvedValue(null),
    expire: vi.fn().mockResolvedValue(1),
  },
  setUserOnline: vi.fn().mockResolvedValue(undefined),
  setUserOffline: vi.fn().mockResolvedValue(undefined),
  isUserOnline: vi.fn().mockResolvedValue(false),
  getOnlineUsers: vi.fn().mockResolvedValue({}),
  getUserSocketId: vi.fn().mockResolvedValue(null),
}));

// Set required env vars for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-min!';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.MONGO_URI = 'will-be-replaced-by-memory-server';
process.env.UPLOAD_DIR = '/tmp/securechat-test-uploads';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterEach(async () => {
  // Clean all collections between tests
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
