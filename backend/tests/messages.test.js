import { describe, it, expect } from 'vitest';
import Message from '../src/models/Message.js';
import { getApp, registerUser } from './helpers.js';

const app = getApp();

async function createConversation(agentA, userBId) {
  const res = await agentA.post('/api/conversations/direct').send({ userId: userBId });
  return res.body._id;
}

async function sendMessage(agent, conversationId, overrides = {}) {
  const msg = await Message.create({
    conversationId,
    sender: overrides.senderId,
    content: overrides.content || 'hello',
    contentType: overrides.contentType || 'text',
    iv: 'iv',
    encryptedKeys: [],
    attachment: overrides.attachment,
  });
  return msg;
}

describe('Message search', () => {
  it('returns empty array when query is blank', async () => {
    const { agent: agentA } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const convId = await createConversation(agentA, userB._id);

    const res = await agentA.get(`/api/messages/${convId}/search`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 403 for a conversation the user is not in', async () => {
    const { agent: agentA } = await registerUser(app);
    const { agent: agentB, user: userB } = await registerUser(app);
    const { user: userC } = await registerUser(app);

    // agentB creates a conversation that agentA is not part of
    const res = await agentB.post('/api/conversations/direct').send({ userId: userC._id });
    const convId = res.body._id;

    const searchRes = await agentA.get(`/api/messages/${convId}/search?q=hello`);
    expect(searchRes.status).toBe(403);
  });

  it('finds messages by attachment filename', async () => {
    const { agent: agentA, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const convId = await createConversation(agentA, userB._id);

    await sendMessage(agentA, convId, {
      senderId: userA._id,
      contentType: 'file',
      attachment: { filename: 'report-2026.pdf', size: 1024, mimeType: 'application/pdf' },
    });
    await sendMessage(agentA, convId, {
      senderId: userA._id,
      content: 'unrelated message',
    });

    const res = await agentA.get(`/api/messages/${convId}/search?q=report`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].attachment.filename).toBe('report-2026.pdf');
  });

  it('finds messages by sender display name', async () => {
    const { agent: agentA, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const convId = await createConversation(agentA, userB._id);

    // Send a message from userA
    await sendMessage(agentA, convId, { senderId: userA._id });

    const res = await agentA.get(`/api/messages/${convId}/search?q=${userA.username}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(String(res.body[0].sender._id)).toBe(String(userA._id));
  });

  it('is case-insensitive', async () => {
    const { agent: agentA, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const convId = await createConversation(agentA, userB._id);

    await sendMessage(agentA, convId, {
      senderId: userA._id,
      contentType: 'file',
      attachment: { filename: 'Budget.XLSX', size: 512, mimeType: 'application/vnd.ms-excel' },
    });

    const res = await agentA.get(`/api/messages/${convId}/search?q=budget`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns at most 30 results', async () => {
    const { agent: agentA, user: userA } = await registerUser(app);
    const { user: userB } = await registerUser(app);
    const convId = await createConversation(agentA, userB._id);

    // Insert 35 messages with matching filename
    await Message.insertMany(
      Array.from({ length: 35 }, (_, i) => ({
        conversationId: convId,
        sender: userA._id,
        content: 'x',
        contentType: 'file',
        iv: 'iv',
        encryptedKeys: [],
        attachment: { filename: `file-${i}.pdf`, size: 100, mimeType: 'application/pdf' },
      }))
    );

    const res = await agentA.get(`/api/messages/${convId}/search?q=file`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(30);
  });
});
