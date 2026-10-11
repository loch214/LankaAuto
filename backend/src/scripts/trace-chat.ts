/**
 * Debug tool: run a customer conversation through the real agent loop
 * (`runAgentTurn` — same path as POST /chat, including the reply guard) and
 * print every tool call, what it returned, any guard intervention, and the
 * final reply. `bench:chat` measures *how fast* a turn is; this shows *what
 * the agent actually did* — what you need when a reply is wrong and you have
 * to tell "the model ignored the data" apart from "the tool returned the
 * wrong data".
 *
 *   npm run trace:chat -- "Oil filter for Suzuki Alto"
 *   npm run trace:chat -- "Oil filter for Suzuki Alto" "HA36S"     (multi-turn)
 *
 * Real Groq calls (free tier ~8000 tokens/min), so turns are spaced out.
 */
import type { ChatMessage } from '../services/agent/groq-client.js';
import { runAgentTurn } from '../services/agent/agent-loop.js';
import { CUSTOMER_TOOLS } from '../services/agent/tools.js';
import { CUSTOMER_SYSTEM_PROMPT } from '../services/agent/customer-agent.js';
import { disconnect } from '../lib/prisma.js';

const turns = process.argv.slice(2);
if (turns.length === 0) turns.push('Oil filter for Suzuki Alto');

const history: ChatMessage[] = [];
for (const [i, text] of turns.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, 15_000));
  console.log(`\n=== CUSTOMER: ${text}`);
  history.push({ role: 'user', parts: [{ text }] });
  try {
    const result = await runAgentTurn(history, CUSTOMER_TOOLS, CUSTOMER_SYSTEM_PROMPT, (e) => console.log('  ' + e));
    console.log('  REPLY:\n    ' + result.reply.replace(/\n/g, '\n    '));
    console.log('  CHIPS: ' + result.citations.map((c) => c.partNumber).join(', '));
    history.push({ role: 'model', parts: [{ text: result.reply }] });
  } catch (err) {
    console.log('  FAILED', String(err));
    break;
  }
}
await disconnect();
