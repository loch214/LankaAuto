import { describe, it, expect, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import { disconnect } from '../lib/prisma.js';
import { ChatRateLimitError } from '../services/agent/gemini-client.js';

// Validation and error-mapping only — a real success path would call
// `runCustomerAgentTurn`, which hits the real Gemini API. Same rule as the
// search route's semantic tier (`parts.test.ts`): this suite never makes a
// live network call. The agent loop itself is covered, mocked, by
// `agent-loop.test.ts`; a live end-to-end chat exchange is verified
// manually against the running dev server.
vi.mock('../services/agent/customer-agent.js', () => ({
  runCustomerAgentTurn: vi.fn(),
}));

const { runCustomerAgentTurn } = await import('../services/agent/customer-agent.js');
const { createApp } = await import('../app.js');

const mockRunCustomerAgentTurn = vi.mocked(runCustomerAgentTurn);
const request = supertest(createApp());

afterAll(async () => {
  await disconnect();
});

describe('POST /chat', () => {
  it('rejects an empty messages array', async () => {
    const res = await request.post('/chat').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a message with an invalid role', async () => {
    const res = await request.post('/chat').send({ messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
  });

  it('rejects an overlong message', async () => {
    const res = await request.post('/chat').send({ messages: [{ role: 'user', content: 'x'.repeat(1001) }] });
    expect(res.status).toBe(400);
  });

  it('rejects a missing messages field', async () => {
    const res = await request.post('/chat').send({});
    expect(res.status).toBe(400);
  });

  it('maps a Gemini quota error to 503, not a generic 500', async () => {
    mockRunCustomerAgentTurn.mockRejectedValueOnce(new ChatRateLimitError('quota exceeded'));
    const res = await request.post('/chat').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/busy|try again/i);
  });

  it('falls through to a generic 500 for a non-rate-limit failure', async () => {
    mockRunCustomerAgentTurn.mockRejectedValueOnce(new Error('something else broke'));
    const res = await request.post('/chat').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(500);
  });
});
