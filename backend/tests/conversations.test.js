import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getApp, registerUser } from './helpers.js';

const app = getApp();

describe('Conversations — direct', () => {
  it('creates a direct conversation between two users', async () => {
    const { agent: agentA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const res = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('direct');
    expect(res.body.participants).toHaveLength(2);
  });

  it('returns existing conversation if one already exists', async () => {
    const { agent: agentA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const first = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    const second = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    expect(second.status).toBe(200);
    expect(second.body._id).toBe(first.body._id);
  });

  it('returns 400 when userId is missing', async () => {
    const { agent } = await registerUser(app);
    const res = await agent.post('/api/conversations/direct').send({});
    expect(res.status).toBe(400);
  });
});

describe('Conversations — group', () => {
  it('creates a group conversation', async () => {
    const { agent } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const res = await agent.post('/api/conversations/group').send({
      name: 'Test Group',
      participantIds: [userB._id],
    });
    expect(res.status).toBe(201);
    expect(res.body.conversation.type).toBe('group');
    expect(res.body.conversation.name).toBe('Test Group');
  });

  it('rejects group creation without a name', async () => {
    const { agent } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const res = await agent.post('/api/conversations/group').send({
      participantIds: [userB._id],
    });
    expect(res.status).toBe(400);
  });

  it('does not add duplicate participants', async () => {
    const { agent, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const createRes = await agent.post('/api/conversations/group').send({
      name: 'Dup Test',
      participantIds: [userB._id],
    });
    const convId = createRes.body.conversation._id;

    // Try to add the creator (already a participant) again
    const addRes = await agent
      .post(`/api/conversations/${convId}/participants`)
      .send({ userIds: [userA._id] });
    expect(addRes.status).toBe(400);
  });

  it('prevents removing the last admin', async () => {
    const { agent, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const createRes = await agent.post('/api/conversations/group').send({
      name: 'Admin Test',
      participantIds: [userB._id],
    });
    const convId = createRes.body.conversation._id;

    const res = await agent
      .delete(`/api/conversations/${convId}/participants/${userA._id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only admin/i);
  });
});

describe('Conversations — muting', () => {
  it('mutes and unmutes a conversation', async () => {
    const { agent: agentA } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const conv = await agentA.post('/api/conversations/direct').send({ userId: userB._id });
    const convId = conv.body._id;

    const muteRes = await agentA.post(`/api/conversations/${convId}/mute`).send({});
    expect(muteRes.status).toBe(200);
    expect(muteRes.body.muted).toBe(true);

    const unmuteRes = await agentA.delete(`/api/conversations/${convId}/mute`);
    expect(unmuteRes.status).toBe(200);
    expect(unmuteRes.body.muted).toBe(false);
  });
});
