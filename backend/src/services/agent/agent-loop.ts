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
/**
 * Wall-clock budget for one whole customer turn (every round combined), not
 * one HTTP call — see `GenerateTurnOptions.deadline` in `groq-client.ts`.
 * Real incident (2026-08-28): a rate-limited burst let retries stack up
 * across rounds and the platform killed the connection with a raw 502
 * before our own code ever got to answer "please try again." This is the
 * ceiling that makes sure the agent gives up on its own terms first.
 */
const TURN_DEADLINE_MS = 20_000;

function isFunctionCallPart(p: ContentPart): p is { functionCall: { name: string; args: Record<string, unknown> } } {
  return 'functionCall' in p;
}

function isTextPart(p: ContentPart): p is { text: string } {
  return 'text' in p;
}

/**
 * Models sometimes write a part number with a look-alike Unicode dash
 * (U+2011 non-breaking hyphen, U+2013 en dash, U+2212 minus...) instead of
 * a plain "-". It looks identical on screen but breaks everything that
 * compares text: the citation filter below silently dropped the part, and a
 * customer copying the number into search found nothing. Seen in a real
 * reply on 2026-10-11, and only some of the time — so it's fixed here,
 * deterministically, not by asking the model nicely in the prompt.
 *
 * Only a dash with a letter/digit directly on both sides is touched — that's
 * a code or a range ("16510‑81420", "2000–2012"). A spaced dash ("parts –
 * oil filter") is ordinary punctuation and left as written.
 */
const LOOKALIKE_DASH = /(?<=[\p{L}\p{N}])[‐-―−﹘﹣－](?=[\p{L}\p{N}])/gu;

export function normaliseDashes(text: string): string {
  return text.replace(LOOKALIKE_DASH, '-');
}

/**
 * The widget shows text as-is, so markdown arrives as literal symbols
 * ("**16510-81420**"). The prompt forbids it and the model still did it
 * (traced 2026-10-11) — so it's removed here instead of requested there.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[ \t]+$/gm, '');
}

/**
 * A sentence claiming a part fits ("it fits your Alto", "will fit the
 * HA36S"). Questions and negations aren't claims — "which one fits",
 * "whether it fits", "doesn't fit" — so a match preceded by those words in
 * the same sentence is skipped. Deliberately narrow: a missed claim falls
 * back to the tool-level guarantee (the model is never handed a single
 * vehicle to pick), while a false alarm only costs one extra model call.
 */
const FIT_CLAIM = /\b(?:fits|will fit|is compatible with)\s+(?:your|the|a|an|all|both|every|this|that|these|those)\b/gi;
const NOT_A_CLAIM = /\b(?:which|whether|if|not|never|no|can't|cannot|don't|doesn't|isn't|won't|unsure|confirm)\b[^.!?\n]*$/i;

export function claimsFit(reply: string): boolean {
  for (const m of reply.matchAll(FIT_CLAIM)) {
    const sentenceStart = Math.max(reply.lastIndexOf('.', m.index), reply.lastIndexOf('\n', m.index), reply.lastIndexOf('?', m.index));
    if (!NOT_A_CLAIM.test(reply.slice(sentenceStart + 1, m.index))) return true;
  }
  return false;
}

const UNBACKED_FIT_CORRECTION =
  'Check failed: your reply says a part fits, but no tool result this turn confirmed a fit for one specific vehicle. ' +
  'Rewrite it. Say only what the tool results say (e.g. "listed for the Alto F8D and HA36S"), then ask which vehicle they have, or say to call the shop. Do not say it fits. Plain text only.';

function safeFallback(cited: readonly PartCitation[]): string {
  const listed = cited.slice(0, 5).map((c) => `- ${c.partNumber ?? ''} ${c.rawName}`.replace(/^- {2}/, '- '));
  return [
    ...(listed.length > 0 ? ['These parts came up:', ...listed, ''] : []),
    "I can't confirm from here which one fits your vehicle. Tell me the chassis code (it's on the revenue licence) or the year, or call the shop and they'll check for you.",
  ].join('\n');
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
  /** Debug hook (`npm run trace:chat`): told about every tool call and every guard intervention. */
  onEvent?: (event: string) => void,
): Promise<AgentTurnResult> {
  const contents: ChatMessage[] = [...history];
  const citations = new Map<string, PartCitation>();
  const deadline = Date.now() + TURN_DEADLINE_MS;
  // Set by a tool result that established a fit for ONE specific vehicle
  // (`ToolExecutionResult.confirmedFit`). Without it, the reply may not
  // claim a fit — checked below before anything reaches the customer.
  let fitConfirmed = false;
  let corrected = false;

  // Keep only citations whose part number the reply actually names — see
  // the note where this is used.
  const reliedOn = (reply: string) =>
    [...citations.values()].filter(
      (c) => c.partNumber !== null && reply.toUpperCase().includes(c.partNumber.toUpperCase()),
    );

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { parts } = await generateTurn(contents, tools, systemPrompt, { deadline });
    const functionCalls = parts.filter(isFunctionCallPart);

    if (functionCalls.length === 0) {
      const reply = stripMarkdown(normaliseDashes(parts.filter(isTextPart).map((p) => p.text).join('')));

      // carelanka's pattern: check the draft with plain code before anyone
      // sees it; on failure, one revision with the exact problem spelled
      // out; if that still fails, a fixed safe answer. Traced before this
      // existed: "16510-81420 fits your Suzuki Alto (F8D model)" to a
      // customer who never said which Alto.
      if (!fitConfirmed && claimsFit(reply)) {
        onEvent?.(`GUARD: unbacked fit claim${corrected ? ' again -> safe fallback' : ' -> asking for a revision'}: ${reply}`);
        if (corrected) {
          return { reply: safeFallback(reliedOn(reply)), citations: reliedOn(reply) };
        }
        corrected = true;
        contents.push({ role: 'model', parts: [{ text: reply }] });
        contents.push({ role: 'user', parts: [{ text: UNBACKED_FIT_CORRECTION }] });
        continue;
      }

      // Every tool call this turn is a candidate citation, but not every
      // candidate ends up in the answer — a semantic search over an
      // out-of-catalogue query (e.g. "brake pads for a Honda Civic" against
      // a U-joint-only shop) returns its nearest neighbours regardless, and
      // those must not be presented as sources for a reply that correctly
      // says "we don't have that." Keeping only citations whose part number
      // is actually named in the reply text is a cheap, honest filter: it
      // can only under-cite (a part discussed without ever printing its
      // number), never claim a source the reply doesn't reference.
      return { reply, citations: reliedOn(reply) };
    }

    contents.push({ role: 'model', parts });

    const functionResponseParts: ContentPart[] = [];
    for (const call of functionCalls) {
      try {
        const result = await executeTool(call.functionCall.name, call.functionCall.args);
        onEvent?.(`CALL ${call.functionCall.name}(${JSON.stringify(call.functionCall.args)})
    -> ${JSON.stringify(result.response).slice(0, 600)}`);
        for (const cited of result.citedParts) citations.set(cited.partId, cited);
        if (result.confirmedFit === true) fitConfirmed = true;
        functionResponseParts.push({
          functionResponse: { name: call.functionCall.name, response: result.response },
        });
      } catch (err) {
        // Tool errors go back to the model as data, not thrown up the
        // stack — a bad/hallucinated id should make the model say "I
        // couldn't find that," not 500 the whole chat request.
        const message = err instanceof Error ? err.message : String(err);
        onEvent?.(`CALL ${call.functionCall.name}(${JSON.stringify(call.functionCall.args)})
    -> ERROR ${message}`);
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
