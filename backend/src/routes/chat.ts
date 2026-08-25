import { Router } from 'express';
import { z } from 'zod';
import { runCustomerAgentTurn } from '../services/agent/customer-agent.js';
import { ChatRateLimitError, type ChatMessage } from '../services/agent/gemini-client.js';

export const chatRouter = Router();

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1000),
});

const chatRequestSchema = z.object({
  // Full conversation so far, including the new user message at the end.
  // Stateless on the server by design — no session/account for customers
  // (PLAN.md: "no signup page, by design"), so the client is the only place
  // history lives.
  messages: z.array(chatMessageSchema).min(1).max(30),
});

/**
 * POST /chat — Phase 5 (PLAN.md §10): the customer agent, function-calling
 * over the read-only tools in `services/agent/tools.ts`. Public, no auth —
 * same as every other customer-facing route; the staff agent (PLAN.md §8,
 * later phase) is not this route with a role check bolted on, it's a
 * separate agent with a different tool set entirely.
 */
chatRouter.post('/', async (req, res, next) => {
  try {
    const { messages } = chatRequestSchema.parse(req.body);

    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result = await runCustomerAgentTurn(history);
    res.json(result);
  } catch (err) {
    // A Gemini quota limit is not our bug — surfaced as 503 so the
    // frontend can show "busy, try again shortly" instead of a generic
    // error, and so it's visibly distinct from an actual server fault in
    // the logs.
    if (err instanceof ChatRateLimitError) {
      res.status(503).json({ error: 'The assistant is temporarily busy. Please try again in a minute.' });
      return;
    }
    next(err);
  }
});
