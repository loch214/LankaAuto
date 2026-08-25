/**
 * Low-level Gemini `generateContent` client with function calling
 * (Phase 5, PLAN.md §10). Plain `fetch` against the REST API, same
 * convention as `services/embeddings.ts` and for the same reason: one
 * endpoint, an API key in the query string, no SDK dependency this project
 * doesn't otherwise need.
 *
 * This file knows nothing about parts, vehicles, or fitment — it is a
 * generic "send a conversation + a tool list, get back either text or a
 * function call" client. `agent-loop.ts` is where domain knowledge lives.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-3.6-flash';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

export class ChatConfigError extends Error {}
export class ChatRequestError extends Error {}
/** Distinguished from a generic `ChatRequestError` so the route can answer 503 ("busy, try again") instead of a 500 ("we broke something") — a quota limit is not our bug. */
export class ChatRateLimitError extends ChatRequestError {}

// Gemini's contents role field only accepts 'user' and 'model' — a
// function's result is sent back as a 'user'-role message containing a
// functionResponse part, not a distinct 'function' role (that's an
// OpenAI-style convention this API doesn't share; confirmed by the API's
// own 400 error when 'function' was tried here).
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GenerateContentResponse {
  candidates?: {
    content?: { role?: string; parts?: ContentPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

async function callGemini(
  model: string,
  contents: readonly ChatMessage[],
  tools: readonly FunctionDeclaration[],
  systemInstruction: string,
  apiKey: string,
  attempt = 1,
): Promise<GenerateContentResponse> {
  const url = `${API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    return callGemini(model, contents, tools, systemInstruction, apiKey, attempt + 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    const message = `Gemini generateContent failed: ${res.status} ${res.statusText} — ${detail}`;
    if (res.status === 429) throw new ChatRateLimitError(message);
    throw new ChatRequestError(message);
  }

  return (await res.json()) as GenerateContentResponse;
}

export interface GenerateTurnResult {
  readonly parts: readonly ContentPart[];
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
  apiKey: string | undefined = process.env['GEMINI_API_KEY'],
  model: string = process.env['GEMINI_CHAT_MODEL'] ?? DEFAULT_CHAT_MODEL,
): Promise<GenerateTurnResult> {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new ChatConfigError('GEMINI_API_KEY is not set');
  }

  const data = await callGemini(model, contents, tools, systemInstruction, apiKey);

  if (data.promptFeedback?.blockReason !== undefined) {
    throw new ChatRequestError(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (parts === undefined) {
    throw new ChatRequestError(
      `Gemini returned no content (finishReason: ${candidate?.finishReason ?? 'unknown'})`,
    );
  }

  return { parts };
}
