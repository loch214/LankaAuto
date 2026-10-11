import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentTurn, claimsFit, stripMarkdown } from './agent-loop.js';
import { generateTurn } from './groq-client.js';
import { executeTool } from './tools.js';

// The loop's own logic (when to stop, how citations accumulate, what
// happens on a tool error or an unbounded call streak) is what's under
// test here — not Groq itself (no real network call, same rule as
// `embeddings.test.ts`) and not the tools' retrieval logic (already
// covered by `tools.test.ts` against the real DB). Both dependencies are
// mocked so this file tests orchestration in isolation.
vi.mock('./groq-client.js', () => ({ generateTurn: vi.fn() }));
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

  it('normalises look-alike Unicode hyphens so a named part number still gets its citation', async () => {
    // Real reply seen 2026-10-11: the model wrote "16510‑81420" (U+2011,
    // non-breaking hyphen) — identical on screen to "16510-81420", but the
    // exact-match citation filter dropped the part, so the customer got no
    // clickable chip, and copying the number into search found nothing.
    mockGenerateTurn
      .mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'search_parts', args: { query: 'oil filter alto' } } }],
      })
      .mockResolvedValueOnce({
        parts: [{ text: 'The oil filter is part 16510‑81420 (Alto 2000–2012). Engine parts – oil filter.' }],
      });

    mockExecuteTool.mockResolvedValueOnce({
      response: { hits: [{ partNumber: '16510-81420' }] },
      citedParts: [{ partId: 'p1', partNumber: '16510-81420', rawName: 'OIL FILTER SUZUKI ALTO' }],
    });

    const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'oil filter for alto' }] }], [], 'system prompt');

    // Dashes *inside* a code/range become plain "-"; a spaced prose dash
    // ("parts – oil filter") is punctuation and is left alone.
    expect(result.reply).toBe('The oil filter is part 16510-81420 (Alto 2000-2012). Engine parts – oil filter.');
    expect(result.citations).toEqual([{ partId: 'p1', partNumber: '16510-81420', rawName: 'OIL FILTER SUZUKI ALTO' }]);
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

  describe('unbacked "it fits" claims (the Suzuki Alto F8D bug)', () => {
    const searchThenClaim = () => {
      mockExecuteTool.mockResolvedValueOnce({
        response: { status: 'NEED_VARIANT' },
        citedParts: [{ partId: 'p1', partNumber: '16510-81420', rawName: 'OIL FILTER SUZUKI ALTO' }],
      });
      mockGenerateTurn.mockResolvedValueOnce({
        parts: [{ functionCall: { name: 'check_part_fits', args: { partId: 'p1', make: 'Suzuki', model: 'Alto' } } }],
      });
      mockGenerateTurn.mockResolvedValueOnce({ parts: [{ text: '16510-81420 fits your Suzuki Alto (F8D model).' }] });
    };

    it('asks the model to revise once, and returns the revised reply', async () => {
      searchThenClaim();
      mockGenerateTurn.mockResolvedValueOnce({
        parts: [{ text: '16510-81420 is listed for the Alto F8D and HA36S. Which one do you have?' }],
      });

      const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'oil filter for alto' }] }], [], 'sys');

      expect(result.reply).toBe('16510-81420 is listed for the Alto F8D and HA36S. Which one do you have?');
      expect(mockGenerateTurn).toHaveBeenCalledTimes(3);
      const correction = mockGenerateTurn.mock.calls[2]![0].at(-1)!;
      expect(JSON.stringify(correction)).toContain('Check failed');
    });

    it('falls back to a fixed safe answer if the revision still claims a fit', async () => {
      searchThenClaim();
      mockGenerateTurn.mockResolvedValueOnce({ parts: [{ text: 'Yes, 16510-81420 fits your Alto.' }] });

      const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'oil filter for alto' }] }], [], 'sys');

      expect(claimsFit(result.reply)).toBe(false);
      expect(result.reply).toContain("can't confirm");
      expect(result.reply).toContain('16510-81420');
    });

    it('lets a fit claim through when a tool confirmed a fit for one vehicle', async () => {
      mockExecuteTool.mockResolvedValueOnce({
        response: { status: 'CONFIRMED' },
        citedParts: [{ partId: 'p1', partNumber: '16510-81420', rawName: 'OIL FILTER SUZUKI ALTO' }],
        confirmedFit: true,
      });
      mockGenerateTurn
        .mockResolvedValueOnce({ parts: [{ functionCall: { name: 'check_part_fits', args: { partId: 'p1', chassisCode: 'HA36S' } } }] })
        .mockResolvedValueOnce({ parts: [{ text: '16510-81420 fits the Alto HA36S.' }] });

      const result = await runAgentTurn([{ role: 'user', parts: [{ text: 'alto HA36S' }] }], [], 'sys');

      expect(result.reply).toBe('16510-81420 fits the Alto HA36S.');
      expect(mockGenerateTurn).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['16510-81420 fits your Suzuki Alto.', true],
    ['It will fit the HA36S.', true],
    ['Tell me which one you have and I can check which part fits your car.', false],
    ["It doesn't fit the Hiace.", false],
    ['I need to confirm whether it fits your Alto.', false],
    ['It is listed for the Alto F8D and HA36S.', false],
  ])('claimsFit(%j) → %s', (text, expected) => {
    expect(claimsFit(text)).toBe(expected);
  });

  it('strips markdown the widget would otherwise show literally', () => {
    expect(stripMarkdown('The part **16510-81420** fits.\n## Note\nUse `GUT12`.')).toBe(
      'The part 16510-81420 fits.\nNote\nUse GUT12.',
    );
  });
});
