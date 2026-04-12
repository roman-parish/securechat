import request from 'supertest';
import { createApp } from '../src/createApp.js';

export function getApp() {
  return createApp();
}

/**
 * Register a user and return { agent, accessToken, refreshToken, user }
 * where agent is a supertest agent pre-configured with the auth token.
 */
export async function registerUser(app, overrides = {}) {
  const payload = {
    username: `user_${Date.now()}`,
    email: `user_${Date.now()}@test.com`,
    password: 'Password123!',
    ...overrides,
  };

  const res = await request(app)
    .post('/api/auth/register')
    .send(payload);

  if (res.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  }

  const { accessToken, refreshToken, user } = res.body;

  const agent = request.agent(app);
  agent.set('Authorization', `Bearer ${accessToken}`);

  return { agent, accessToken, refreshToken, user, password: payload.password };
}
