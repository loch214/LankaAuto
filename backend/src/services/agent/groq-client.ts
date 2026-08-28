/**
 * Low-level Groq chat-completions client with function calling (switched
 * from Gemini — see HANDOFF.md, "chat agent latency fix"). Groq's inference
 * hardware is built for speed; Gemini's free-tier `generateContent` measured
 * 11-27s per customer message in production (2 sequential round trips per
 * turn), which is why this exists. Embeddings stay on Gemini
 * (`services/embeddings.ts`, untouched) — only the chat model moved.
 *
 * Groq's API is OpenAI-compatible (`/openai/v1/chat/completions`), which
 * uses a different message shape than Gemini's `contents`/`parts` — a
 * `system`/`user`/`assistant`/`tool` role list, `tool_calls` with ids on the
 * assistant message, matching `tool_call_id` on the follow-up `tool`
 * message. Rather than push that shape through `agent-loop.ts` and
 * `tools.ts`, this file keeps the same external types Gemini's client used
 * (`ChatMessage`/`ContentPart`/`FunctionDeclaration`, `generateTurn`) and
 * translates to/from OpenAI's wire format internally — so this is the only
 * file that knows Groq exists.
 */

const API_BASE = 'https://api.groq.com/openai/v1';
// Benchmarked on this project's own key (`npm run bench:chat`): gpt-oss-20b,
// gpt-oss-120b and qwen3.8-27b all answer a trivial prompt in ~0.5s, so the
// largest/most capable one was chosen — speed is not the differentiator
// between them, and tool-call accuracy matters more here. Note Groq's model
// catalogue varies by account: llama-3.3-70b-versatile 404s on this key.
const DEFAULT_CHAT_MODEL = 'openai/gpt-oss-120b';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
/** Ceiling on a single `retry-after`-driven wait — a customer won't sit through more than this for one retry. */
const MAX_RETRY_WAIT_MS = 8000;

export class ChatConfigError extends Error {}
export class ChatRequestError extends Error {}
/** Distinguished from a generic `ChatRequestError` so the route can answer 503 ("busy, try again") instead of a 500 ("we broke something") — a rate limit is not our bug. */
export class ChatRateLimitError extends ChatRequestError {}

// Kept as 'user'/'model' (Gemini's naming) rather than renamed to
// 'user'/'assistant' — this type is used throughout agent-loop.ts/tools.ts
// and renaming it would be a pure churn diff with no behavior change.
export type ChatRole = 'user' | 'model';

export interface FunctionCallPart {
  readonly functionCall: { readonly name: string; readonly args: Record<string, unknown> };
}
export interface FunctionResponsePart {
  readonly functionResponse: { readonly name: string; readonly response: Record<string, unknown> };
}
export interface TextPart {
  readonly text: string;
}
export type ContentPart = TextPart | FunctionCallPart | FunctionResponsePart;

export interface ChatMessage {
  readonly role: ChatRole;
  readonly parts: readonly ContentPart[];
}

export interface FunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: 'OBJECT';
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

function isFunctionCallPart(p: ContentPart): p is FunctionCallPart {
  return 'functionCall' in p;
}
function isFunctionResponsePart(p: ContentPart): p is FunctionResponsePart {
  return 'functionResponse' in p;
}
function isTextPart(p: ContentPart): p is TextPart {
  return 'text' in p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Gemini-shaped ChatMessage[] -> OpenAI-shaped `messages` -----------

interface OpenAIToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

type OpenAIMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string | null; readonly tool_calls?: readonly OpenAIToolCall[] }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

/**
 * Tool-call ids only need to be consistent *within one translation pass*,
 * not persisted anywhere — every `generateTurn` call re-translates the full
 * history from scratch. `agent-loop.ts` always pushes a 'model' message
 * with N functionCall parts immediately followed by a 'user' message with
 * exactly N functionResponse parts, same order — so tracking the ids from
 * the most recent assistant tool-call message and matching by position is
 * enough to link them correctly.
 */
function toOpenAIMessages(contents: readonly ChatMessage[], systemInstruction: string): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [{ role: 'system', content: systemInstruction }];
  let pendingToolCallIds: readonly string[] = [];

  contents.forEach((msg, msgIndex) => {
    if (msg.role === 'model') {
      const functionCalls = msg.parts.filter(isFunctionCallPart);
      const text = msg.parts.filter(isTextPart).map((p) => p.text).join('');

      if (functionCalls.length > 0) {
        const ids = functionCalls.map((_, i) => `call_${msgIndex}_${i}`);
        pendingToolCallIds = ids;
        messages.push({
          role: 'assistant',
          content: text.length > 0 ? text : null,
          tool_calls: functionCalls.map((p, i) => ({
            id: ids[i]!,
            type: 'function',
            function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) },
          })),
        });
      } else {
        messages.push({ role: 'assistant', content: text });
      }
      return;
    }

    // role 'user'
    const functionResponses = msg.parts.filter(isFunctionResponsePart);
    if (functionResponses.length > 0) {
      functionResponses.forEach((p, i) => {
        messages.push({
          role: 'tool',
          tool_call_id: pendingToolCallIds[i] ?? `call_${msgIndex}_${i}`,
          content: JSON.stringify(p.functionResponse.response),
        });
      });
      return;
    }

    const text = msg.parts.filter(isTextPart).map((p) => p.text).join('');
    messages.push({ role: 'user', content: text });
  });

  return messages;
}

/**
 * Gemini's function-declaration schema spells its types in UPPERCASE
 * ('OBJECT', 'STRING', 'NUMBER'); real JSON Schema — which Groq validates
 * against strictly — requires lowercase. Groq rejects the uppercase form
 * with a 400 ("value must be one of array, boolean, integer, null, number,
 * object, string"), so the types are lowercased here rather than by
 * rewriting every declaration in `tools.ts`: that file's shape is shared
 * with the Gemini-era types and this client is already the single place
 * that knows Groq's wire format.
 */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = key === 'type' && typeof value === 'string' ? value.toLowerCase() : toJsonSchema(value);
  }
  return out;
}

function toOpenAITools(tools: readonly FunctionDeclaration[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) },
  }));
}

interface GroqResponseToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface GroqChatCompletionResponse {
  choices?: {
    message?: { role: string; content?: string | null; tool_calls?: GroqResponseToolCall[] };
    finish_reason?: string;
  }[];
}

async function callGroq(
  model: string,
  messages: readonly OpenAIMessage[],
  tools: readonly FunctionDeclaration[],
  apiKey: string,
  /** Absolute `Date.now()`-style deadline for the *whole customer turn*, not just this call — see `generateTurn`. */
  deadline: number | undefined,
  attempt = 1,
): Promise<GroqChatCompletionResponse> {
  // A prior round in this same turn already burned the whole budget (e.g.
  // round 1's retries ate it) — don't even try, fail straight to the 503
  // path below rather than start a request we already know we can't afford
  // to wait out.
  if (deadline !== undefined && Date.now() >= deadline) {
    throw new ChatRateLimitError('Groq request budget exceeded for this turn — try again shortly.');
  }

  const body = {
    model,
    messages,
    tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
  };

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
    // Groq's free tier limits *tokens* per minute (8000 TPM measured on this
    // project's key), not just requests, and its 429 says exactly how long to
    // wait ("Please try again in 2.985s") via `retry-after`. Blind
    // exponential backoff ignored that and gave up while still inside the
    // window — honouring the header turns a customer-visible error into a
    // slightly slower reply. Clamped so a pathological value can't hang the
    // request past the frontend's patience.
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000 + 250, MAX_RETRY_WAIT_MS)
      : backoff;

    // Real incident (2026-08-28, production): a burst of requests near the
    // 8000 TPM ceiling stacked up multiple retries across the agent's 2
    // sequential calls-per-turn and produced a raw 502 from the platform
    // instead of our own error response — worse for the customer than a
    // fast, honest "try again." Never wait past the turn's own deadline;
    // fail into the same 503 path a real rate-limit error takes instead.
    if (deadline !== undefined && Date.now() + waitMs >= deadline) {
      throw new ChatRateLimitError('Groq request budget exceeded for this turn — try again shortly.');
    }

    await sleep(waitMs);
    return callGroq(model, messages, tools, apiKey, deadline, attempt + 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    const message = `Groq chat completion failed: ${res.status} ${res.statusText} — ${detail}`;
    if (res.status === 429) throw new ChatRateLimitError(message);
    throw new ChatRequestError(message);
  }

  return (await res.json()) as GroqChatCompletionResponse;
}

export interface GenerateTurnResult {
  readonly parts: readonly ContentPart[];
}

export interface GenerateTurnOptions {
  readonly apiKey?: string;
  readonly model?: string;
  /**
   * Absolute `Date.now()`-style deadline shared across every `generateTurn`
   * call in one customer turn (`agent-loop.ts` computes it once and threads
   * it through every round) — bounds the *whole* multi-round conversation,
   * not one HTTP call. Without this, a rate-limited turn could retry its way
   * past whatever timeout sits in front of this service and come back as a
   * raw platform error instead of our own "please try again" message.
   */
  readonly deadline?: number;
}

/**
 * One request/response round trip. Does not loop — `agent-loop.ts` decides
 * whether a function-call response needs another round trip; this function
 * only knows how to make one call and parse its result.
 */
export async function generateTurn(
  contents: readonly ChatMessage[],
  tools: readonly FunctionDeclaration[],
  systemInstruction: string,
  {
    apiKey = process.env['GROQ_API_KEY'],
    model = process.env['GROQ_CHAT_MODEL'] ?? DEFAULT_CHAT_MODEL,
    deadline,
  }: GenerateTurnOptions = {},
): Promise<GenerateTurnResult> {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ChatConfigError('GROQ_API_KEY is not set');
  }

  const messages = toOpenAIMessages(contents, systemInstruction);
  const data = await callGroq(model, messages, tools, apiKey, deadline);

  const choice = data.choices?.[0];
  const message = choice?.message;
  if (message === undefined) {
    throw new ChatRequestError(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }

  const parts: ContentPart[] = [];
  for (const tc of message.tool_calls ?? []) {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      // A malformed arguments string is a model mistake, not a transport
      // failure — hand the tool an empty object rather than throwing, same
      // as `agent-loop.ts` turning a tool execution error into data the
      // model can react to instead of a crashed request.
      args = {};
    }
    parts.push({ functionCall: { name: tc.function.name, args } });
  }
  if (message.content !== null && message.content !== undefined && message.content.length > 0) {
    parts.push({ text: message.content });
  }

  if (parts.length === 0) {
    throw new ChatRequestError(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`);
  }

  return { parts };
}
