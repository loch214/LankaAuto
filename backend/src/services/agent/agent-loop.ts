/**
 * The tool-calling loop itself (Phase 5, PLAN.md §10). Generic over which
 * tool list and system prompt are used, so Phase 8's staff agent can reuse
 * this engine later with a different tool set/tone instead of duplicating
 * the request/response plumbing.
 *
 * Gemini's function-calling contract: the model can respond with either
 * text or one or more `functionCall` parts. When it calls a function, the
 * result goes back as a `functionResponse` part on a 'user'-role message
 * (see the comment on `ChatRole` in `groq-client.ts`) and the model is
 * asked again — repeat until it answers with text instead of a call, or a
 * round cap is hit (a model that keeps calling tools forever is a bug, not
 * something to loop on indefinitely).
 */
import { generateTurn, type ChatMessage, type ContentPart, type FunctionDeclaration } from './groq-client.js';
import { executeTool, type PartCitation } from './tools.js';

const MAX_TOOL_ROUNDS = 5;

function isFunctionCallPart(p: ContentPart): p is { functionCall: { name: string; args: Record<string, unknown> } } {
  return 'functionCall' in p;
}

function isTextPart(p: ContentPart): p is { text: string } {
  return 'text' in p;
}

export interface AgentTurnResult {
  readonly reply: string;
  /** Every part any tool call this turn actually returned — the frontend's citation list. Never claims a part was involved unless a tool call proves it. */
  readonly citations: readonly PartCitation[];
}

export async function runAgentTurn(
  history: readonly ChatMessage[],
  tools: readonly FunctionDeclaration[],
  systemPrompt: string,
): Promise<AgentTurnResult> {
  const contents: ChatMessage[] = [...history];
  const citations = new Map<string, PartCitation>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { parts } = await generateTurn(contents, tools, systemPrompt);
    const functionCalls = parts.filter(isFunctionCallPart);

    if (functionCalls.length === 0) {
      const reply = parts.filter(isTextPart).map((p) => p.text).join('');
      // Every tool call this turn is a candidate citation, but not every
      // candidate ends up in the answer — a semantic search over an
      // out-of-catalogue query (e.g. "brake pads for a Honda Civic" against
      // a U-joint-only shop) returns its nearest neighbours regardless, and
      // those must not be presented as sources for a reply that correctly
      // says "we don't have that." Keeping only citations whose part number
      // is actually named in the reply text is a cheap, honest filter: it
      // can only under-cite (a part discussed without ever printing its
      // number), never claim a source the reply doesn't reference.
      const reliedOn = [...citations.values()].filter(
        (c) => c.partNumber !== null && reply.toUpperCase().includes(c.partNumber.toUpperCase()),
      );
      return { reply, citations: reliedOn };
    }

    contents.push({ role: 'model', parts });

    const functionResponseParts: ContentPart[] = [];
    for (const call of functionCalls) {
      try {
        const result = await executeTool(call.functionCall.name, call.functionCall.args);
        for (const cited of result.citedParts) citations.set(cited.partId, cited);
        functionResponseParts.push({
          functionResponse: { name: call.functionCall.name, response: result.response },
        });
      } catch (err) {
        // Tool errors go back to the model as data, not thrown up the
        // stack — a bad/hallucinated id should make the model say "I
        // couldn't find that," not 500 the whole chat request.
        const message = err instanceof Error ? err.message : String(err);
        functionResponseParts.push({
          functionResponse: { name: call.functionCall.name, response: { error: message } },
        });
      }
    }
    // Gemini sends function results back as a 'user'-role message, not a
    // distinct 'function' role — see the comment on `ChatRole`.
    contents.push({ role: 'user', parts: functionResponseParts });
  }

  return {
    reply: "I'm having trouble finishing that lookup right now — please try again in a moment, or call the shop directly.",
    citations: [...citations.values()],
  };
}
