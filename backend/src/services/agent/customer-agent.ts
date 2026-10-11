/**
 * Phase 5 (PLAN.md §10) — the customer-facing chat agent. Read-only: the
 * tools available (`tools.ts`) are the shared lookup tools only, none of
 * the staff-only write tools (`update_availability` etc., PLAN.md §7) —
 * Phase 8's staff agent is a separate, later increment, not this file
 * with a flag.
 */
import type { ChatMessage } from './groq-client.js';
import { runAgentTurn, type AgentTurnResult } from './agent-loop.js';
import { CUSTOMER_TOOLS } from './tools.js';

// PLAN.md §7's customer-agent spec, verbatim in spirit: helpful tone,
// never state or imply stock/availability (revised 2026-08-26 — customers
// call or visit to check, staff-only concern now), never invent a part,
// and the grounding rule (cite raw_name / matched attributes, say "I'm not
// sure" rather than guess) applies here same as staff.
// Deliberately terse. This prompt ships on *every* LLM call (twice per
// customer message), so its length is a direct tax on Groq's 8000
// tokens-per-minute free-tier budget — measured at ~594 tokens in its
// original prose form, which capped the whole site at ~3.5 messages/minute.
// Every rule below is still here; only the padding was cut. Do not re-expand
// this into paragraphs without re-checking `npm run bench:chat`.
// The opening line is load-bearing and has to track the catalogue. It used
// to read "LankaAuto sells U-joints, steering joints, and driveline parts",
// which was true when `parts` held nothing but one GMB price list — and
// became false the moment `seed-sample-catalogue.ts` filled the other eight
// categories. Caught in testing, not review: asked for engine oil, the agent
// answered "we only sell U-joints, steering joints and driveline parts",
// which would have turned away every customer asking for brake pads or a
// filter. If the category list in `seed-categories.ts` changes again, this
// line changes with it.
// The oils line used to read "It does not sell oils, fluids or tyres — say
// so plainly if asked", and the model tacked "(We do not sell oils or
// fluids.)" onto an answer about an OIL FILTER (seen 2026-10-11). It now
// says what *is* sold in that family, so "oil" alone doesn't trigger it.
//
// Fitment rules live mostly in the tools now (`tools.ts` header): the
// tools answer NEED_VARIANT/CONFIRMED/... with a `tellCustomer` line, and
// `agent-loop.ts` blocks an unbacked "it fits" — the prompt only has to
// point at that, not carry the whole decision.
export const CUSTOMER_SYSTEM_PROMPT = `You are the LankaAuto parts assistant on the shop's website. LankaAuto sells spare parts for Japanese vehicles: engine parts (including oil, air and fuel filters), brake parts, suspension parts, shock absorbers, gearbox parts, electrical parts, lights and mirrors, body parts, U-joints and steering joints. It does not sell engine oil, fluids or tyres — mention that only if they ask for those.

Style: patient and helpful. Many customers aren't fluent in English — short, simple sentences, everyday words. Brief: a few sentences or a short list. List two or more parts as "-" lines. Plain text only, never markdown.

Tools:
- Customer names a vehicle → find_parts_for_vehicle (with partQuery for the kind of part) or check_part_fits. Pass the vehicle exactly as they said it; add chassisCode or year only if they gave it.
- Part number or a need with no vehicle → search_parts.
- Every fitment result has a status and a tellCustomer line. Follow tellCustomer. NEED_VARIANT means you don't know their vehicle yet: never say a part fits — show what is listed for each variant and ask which one they have.

Rules:
- Never invent a part number, name or fitment. Only say what a tool returned this turn.
- A part's name mentioning a vehicle is not proof it fits.
- Always give the exact part number of a part you discuss.
- Never state or imply stock or price. For those, say to call or visit the shop.
- If nothing is found, say so plainly and suggest calling the shop.`;

export async function runCustomerAgentTurn(history: readonly ChatMessage[]): Promise<AgentTurnResult> {
  return runAgentTurn(history, CUSTOMER_TOOLS, CUSTOMER_SYSTEM_PROMPT);
}
