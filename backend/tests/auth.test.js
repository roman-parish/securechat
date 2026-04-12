import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerUser } from './helpers.js';

const app = getApp();

describe('Auth — register', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.username).toBe('testuser');
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'dupuser', email: 'a@example.com', password: 'Password123!',
    });
    const res = await request(app).post('/api/auth/register').send({
      username: 'dupuser', email: 'b@example.com', password: 'Password123!',
    });
    expect(res.status).toBe(409);
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'newuser', email: 'new@example.com', password: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'newuser2', email: 'not-an-email', password: 'Password123!',
    });
    expect(res.status).toBe(400);
  });
});

describe('Auth — login', () => {
  it('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'loginuser', email: 'login@example.com', password: 'Password123!',
    });
    const res = await request(app).post('/api/auth/login').send({
      username: 'loginuser', password: 'Password123!',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'loginuser2', email: 'login2@example.com', password: 'Password123!',
    });
    const res = await request(app).post('/api/auth/login').send({
      username: 'loginuser2', password: 'WrongPass!',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: 'nobody', password: 'Password123!',
    });
    expect(res.status).toBe(401);
  });
});

describe('Auth — refresh token', () => {
  it('issues new tokens with a valid refresh token', async () => {
    const { refreshToken } = await registerUser(app);
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    // New refresh token should differ from the old one
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bad.token.here' });
    expect(res.status).toBe(401);
  });
});

describe('Auth — logout', () => {
  it('logs out and invalidates the refresh token', async () => {
    const { agent, refreshToken } = await registerUser(app);

    const logoutRes = await agent.post('/api/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    // Refresh should now fail
    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});

describe('Auth — protected route', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid token', async () => {
    const { agent } = await registerUser(app);
    const res = await agent.get('/api/users/me');
    expect(res.status).toBe(200);
  });
});
