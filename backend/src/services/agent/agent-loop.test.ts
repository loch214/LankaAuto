import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentTurn } from './agent-loop.js';
import { generateTurn } from './gemini-client.js';
import { executeTool } from './tools.js';

// The loop's own logic (when to stop, how citations accumulate, what
// happens on a tool error or an unbounded call streak) is what's under
// test here — not Gemini itself (no real network call, same rule as
// `embeddings.test.ts`) and not the tools' retrieval logic (already
// covered by `tools.test.ts` against the real DB). Both dependencies are
// mocked so this file tests orchestration in isolation.
vi.mock('./gemini-client.js', () => ({ generateTurn: vi.fn() }));
vi.mock('./tools.js', () => ({ executeTool: vi.fn() }));

const mockGenerateTurn = vi.mocked(generateTurn);
const mockExecuteTool = vi.mocked(executeTool);

describe('runAgentTurn', () => {
  beforeEach(() => {
    mockGenerateTurn.mockReset();
    mockExecuteTool.mockReset();
  });

  it('returns the model’s text directly when it makes no tool call', async () => {
    mockGenerateTurn.mockResolvedValueOnce({ parts: [{ text: 'Hello, how can I help?' }] });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'hi' }] }], [], 'system prompt');

    expect(result.reply).toBe('Hello, how can I help?');
    expect(result.citations).toEqual([]);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('executes a requested tool, feeds the result back, and returns the follow-up text', async () => {
    mockGenerateTurn
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'search_parts', args: { query: 'GUT12' } } }],
      })
      .mockResolvedValueOnce({ parts: [{ text: 'GUT12 is in stock.' }] });

    mockExecuteTool.mockResolvedValueOnce({
      response: { hits: [{ partNumber: 'GUT12' }] },
      citedParts: [{ partId: 'p1', partNumber: 'GUT12', rawName: 'TOYOTA HIACE' }],
    });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'is GUT12 in stock?' }] }], [], 'system prompt');

    expect(result.reply).toBe('GUT12 is in stock.');
    expect(result.citations).toEqual([{ partId: 'p1', partNumber: 'GUT12', rawName: 'TOYOTA HIACE' }]);
    expect(mockGenerateTurn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates citations across multiple tool calls that reference the same part', async () => {
    mockGenerateTurn
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'search_parts', args: { query: 'GUT12' } } }],
      })
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'lookup_vehicle', args: { model: 'hiace' } } }],
      })
      .mockResolvedValueOnce({ parts: [{ text: 'Yes, GUT12 fits.' }] });

    const cited = { partId: 'p1', partNumber: 'GUT12', rawName: 'TOYOTA HIACE' };
    mockExecuteTool
      .mockResolvedValueOnce({ response: {}, citedParts: [cited] })
      .mockResolvedValueOnce({ response: {}, citedParts: [cited] });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'does GUT12 fit my hiace' }] }], [], 'sp');

    expect(result.citations).toEqual([cited]);
  });

  it('turns a tool execution error into a function response instead of throwing', async () => {
    mockGenerateTurn
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'check_fitment', args: { partId: 'bad', vehicleId: 'bad' } } }],
      })
      .mockResolvedValueOnce({ parts: [{ text: "I couldn't find that part." }] });

    mockExecuteTool.mockRejectedValueOnce(new Error('no part with id bad'));

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'does it fit' }] }], [], 'sp');

    expect(result.reply).toBe("I couldn't find that part.");
    // The error must have been reported back to the model as a
    // functionResponse part on a 'user'-role message, not left the second
    // generateTurn call unreachable.
    expect(mockGenerateTurn).toHaveBeenCalledTimes(2);
    const secondCallContents = mockGenerateTurn.mock.calls[1]![0];
    const lastMessage = secondCallContents[secondCallContents.length - 1]!;
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.parts[0]).toHaveProperty('functionResponse');
  });

  it('drops a citation for a part the tool returned but the reply never actually names', async () => {
    // Real failure this catches: a semantic search over an out-of-catalogue
    // query still returns its nearest neighbours, and those must not be
    // presented as sources for a reply that correctly says "we don't have
    // that."
    mockGenerateTurn
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'search_parts', args: { query: 'brake pads' } } }],
      })
      .mockResolvedValueOnce({
        parts: [{ text: 'We do not have brake pads in our catalogue — please call the shop.' }],
      });

    mockExecuteTool.mockResolvedValueOnce({
      response: { hits: [{ partNumber: 'GUT12' }] },
      citedParts: [{ partId: 'p1', partNumber: 'GUT12', rawName: 'TOYOTA HIACE' }],
    });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'brake pads for a civic' }] }], [], 'sp');

    expect(result.citations).toEqual([]);
  });

  it('gives up with an apology instead of looping forever on a model that never stops calling tools', async () => {
    mockGenerateTurn.mockResolvedValue({
      parts: [{ functionCall: { name: 'search_parts', args: { query: 'x' } } }],
    });
    mockExecuteTool.mockResolvedValue({ response: {}, citedParts: [] });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'hi' }] }], [], 'sp');

    expect(result.reply).toMatch(/try again|call the shop/i);
    // Bounded, not unbounded — proves there's an actual cap, not a fluke pass.
    expect(mockGenerateTurn.mock.calls.length).toBeLessThan(20);
  });
});
