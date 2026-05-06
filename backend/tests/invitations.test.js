import { describe, it, expect } from 'vitest';
import { getApp, registerUser } from './helpers.js';

const app = getApp();

async function createGroup(agent, participantIds = []) {
  const res = await agent.post('/api/conversations/group').send({
    name: 'Test Group',
    participantIds,
  });
  return res.body.conversation;
}

describe('Group invitations', () => {
  it('admin can invite a user to a group', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const { user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);

    const res = await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });
    expect(res.status).toBe(200);
  });

  it('returns 400 when inviting a user already in the group', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);

    const res = await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userB._id });
    expect(res.status).toBe(400);
  });

  it('returns 400 when inviting a user who already has a pending invitation', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const { user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);

    await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });
    const res = await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });
    expect(res.status).toBe(400);
  });

  it('non-admin cannot invite', async () => {
    const { agent: admin } = await registerUser(app);
    const { agent: agentB, user: userB } = await registerUser(app);
    const { user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);

    const res = await agentB.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });
    expect(res.status).toBe(403);
  });

  it('invited user sees the invitation in their pending list', async () => {
    const { agent: admin } = await registerUser(app);
    const { agent: agentB, user: userB } = await registerUser(app);
    const { agent: agentC, user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);
    await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });

    const res = await agentC.get('/api/conversations/invitations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(String(res.body[0].conversationId)).toBe(String(group._id));
  });

  it('accepting an invitation adds user to the group', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const { agent: agentC, user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);
    await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });

    // Get invitation id
    const listRes = await agentC.get('/api/conversations/invitations');
    const invId = listRes.body[0]._id;

    const acceptRes = await agentC.post(`/api/conversations/${group._id}/invitations/${invId}/accept`);
    expect(acceptRes.status).toBe(200);

    // userC should now be a participant
    const convRes = await agentC.get(`/api/conversations/${group._id}`);
    expect(convRes.status).toBe(200);
    const participantIds = convRes.body.participants.map(p => p._id || p);
    expect(participantIds.map(String)).toContain(String(userC._id));
  });

  it('declining an invitation does not add user to the group', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const { agent: agentC, user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);
    await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });

    const listRes = await agentC.get('/api/conversations/invitations');
    const invId = listRes.body[0]._id;

    const declineRes = await agentC.post(`/api/conversations/${group._id}/invitations/${invId}/decline`);
    expect(declineRes.status).toBe(200);

    // userC should NOT be a participant
    const convRes = await agentC.get(`/api/conversations/${group._id}`);
    expect([403, 404]).toContain(convRes.status);
  });

  it('admin can see pending invitations for their group', async () => {
    const { agent: admin } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const { user: userC } = await registerUser(app);

    const group = await createGroup(admin, [userB._id]);
    await admin.post(`/api/conversations/${group._id}/invite`).send({ userId: userC._id });

    const res = await admin.get(`/api/conversations/${group._id}/invitations`);
    expect(res.status).toBe(200);
    // group creation invited userB + we explicitly invited userC = 2 pending
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const cInv = res.body.find(i => String(i.invitee._id) === String(userC._id));
    expect(cInv).toBeDefined();
  });
});
