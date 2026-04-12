import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Message from '../src/models/Message.js';
import Conversation from '../src/models/Conversation.js';
import { getApp, registerUser } from './helpers.js';

const app = getApp();

describe('Account deletion', () => {
  it('requires a password to delete', async () => {
    const { agent } = await registerUser(app);
    const res = await agent.delete('/api/auth/account').send({});
    expect(res.status).toBe(400);
  });

  it('rejects deletion with wrong password', async () => {
    const { agent } = await registerUser(app);
    const res = await agent.delete('/api/auth/account').send({ password: 'WrongPass!' });
    expect(res.status).toBe(401);
  });

  it('deletes the user document', async () => {
    const { agent, user, password } = await registerUser(app);
    const res = await agent.delete('/api/auth/account').send({ password });
    expect(res.status).toBe(200);

    const found = await User.findById(user._id);
    expect(found).toBeNull();
  });

  it('removes user from shared conversations', async () => {
    const { agent: agentA, user: userA, password: passwordA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    // Create a shared conversation
    const convRes = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    const convId = convRes.body._id;

    // Delete userA
    await agentA.delete('/api/auth/account').send({ password: passwordA });

    // Conversation should still exist (userB is still in it)
    const conv = await Conversation.findById(convId);
    expect(conv).not.toBeNull();
    const participantIds = conv.participants.map(String);
    expect(participantIds).not.toContain(String(userA._id));
    expect(participantIds).toContain(String(userB._id));
  });

  it('deletes conversations that become empty', async () => {
    const { agent: agentA, user: userA, password: passwordA } = await registerUser(app);

    // Create a solo-ish scenario: direct conversation where only userA remains
    // We simulate this by creating a conversation and manually removing the other participant
    const { user: userB } = await registerUser(app);
    const convRes = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    const convId = convRes.body._id;

    // Remove userB directly from DB to simulate them having already deleted their account
    await Conversation.findByIdAndUpdate(convId, { $pull: { participants: userB._id } });

    // Now delete userA — conversation should be cleaned up
    await agentA.delete('/api/auth/account').send({ password: passwordA });

    const conv = await Conversation.findById(convId);
    expect(conv).toBeNull();
  });

  it('prevents accessing protected routes after deletion', async () => {
    const { agent, accessToken, password } = await registerUser(app);
    await agent.delete('/api/auth/account').send({ password });

    // The access token is still cryptographically valid for its TTL,
    // but the user no longer exists in the DB
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`);
    // Should be 404 (user not found) or 401
    expect([401, 404]).toContain(res.status);
  });
});
