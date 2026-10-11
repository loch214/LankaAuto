/**
 * Tool declarations + execution for the Phase 5 customer agent (PLAN.md §7).
 * Every tool here wraps a service already built and tested in an earlier
 * phase — `search_parts` → `hybridPartSearch` (Phase 3), the two fitment
 * tools → `fitment.ts` (Phase 4).
 *
 * **The fitment tools take the vehicle as the customer said it, not an id.**
 * Redesigned 2026-10-11. The old shape was `lookup_vehicle` → id, then
 * `check_fitment(partId, vehicleId)`, with a prompt rule saying "if
 * lookup_vehicle returns several vehicles, ask which — don't guess." Traced
 * live: "Oil filter for Suzuki Alto" → lookup returned two Altos (F8D,
 * HA36S) → the model checked only the first → "16510-81420 fits your Suzuki
 * Alto (F8D model)", for a customer who never said F8D. Two runs out of
 * three. A prompt rule is a request; the model treated it as optional.
 *
 * So the decision moved into code. The tools below resolve the vehicle
 * themselves, and when the description matches more than one vehicle they
 * answer `NEED_VARIANT` — per-variant facts and an instruction to ask —
 * with no single "fits" verdict in the response at all. The model never
 * holds one vehicle id it could quietly pick. Same lesson as carelanka's
 * agents: code makes the decision, the model only phrases it.
 *
 * `find_cross_references` and `retrieve_part_notes` (PLAN.md §7, tools 4–5)
 * are deliberately absent — both are cut/deferred (PLAN.md §6), and a tool
 * that always returns nothing is worse than no tool.
 */
import { z } from 'zod';
import type { Vehicle } from '@prisma/client';
import type { FunctionDeclaration } from './groq-client.js';
import { prisma } from '../../lib/prisma.js';
import { hybridPartSearch } from '../hybrid-part-search.js';
import { embedTexts } from '../embeddings.js';
import { distancesForParts } from '../part-embeddings.js';
import { checkFitment, findFitmentsForVehicle, type FitmentVerdict } from '../fitment.js';

export class ToolArgumentError extends Error {}
export class ToolNotFoundError extends Error {}

const searchPartsArgs = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

const vehicleDescriptionArgs = {
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  chassisCode: z.string().min(1).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
};

const checkPartFitsArgs = z.object({ partId: z.string().min(1), ...vehicleDescriptionArgs });
const findPartsForVehicleArgs = z.object({ partQuery: z.string().min(1).optional(), ...vehicleDescriptionArgs });

type VehicleDescription = { make?: string | undefined; model?: string | undefined; chassisCode?: string | undefined; year?: number | undefined };

// Shared by both fitment tools. Short on purpose — see the token note below.
const VEHICLE_PARAMS = {
  make: { type: 'STRING', description: "e.g. 'Toyota'." },
  model: { type: 'STRING', description: "e.g. 'Hiace'." },
  chassisCode: { type: 'STRING', description: "e.g. 'HA36S'. Alone is fine if that's all the customer gave." },
  year: { type: 'NUMBER', description: 'Model year, only if the customer said it.' },
} as const;

// These declarations ship on every LLM call, so their length is a direct
// tax on Groq's 8000 tokens-per-minute free-tier budget — keep them terse.
// Fewer tools (3, was 4) also means fewer rounds per turn.
export const CUSTOMER_TOOLS: readonly FunctionDeclaration[] = [
  {
    name: 'search_parts',
    description:
      'Search the catalogue by part number (exact or approximate) or by description. Use when the customer gives a part number or a need with no vehicle. Never returns stock.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Part number or description.' },
        limit: { type: 'NUMBER', description: 'Max results, default 5, max 10.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_parts_for_vehicle',
    description:
      "Parts on record for a vehicle, described as the customer said it. Pass partQuery (e.g. 'oil filter') when they asked for a kind of part. Follow the returned status and tellCustomer exactly.",
    parameters: {
      type: 'OBJECT',
      properties: { partQuery: { type: 'STRING', description: "e.g. 'brake pads'." }, ...VEHICLE_PARAMS },
    },
  },
  {
    name: 'check_part_fits',
    description:
      'Check whether one part (partId from an earlier result) fits a vehicle, described as the customer said it. Follow the returned status and tellCustomer exactly.',
    parameters: {
      type: 'OBJECT',
      properties: { partId: { type: 'STRING', description: 'partId from an earlier result, or the exact part number.' }, ...VEHICLE_PARAMS },
      required: ['partId'],
    },
  },
];

/** Every part referenced by a tool call this turn — the source citations returned to the frontend. */
export interface PartCitation {
  readonly partId: string;
  readonly partNumber: string | null;
  readonly rawName: string;
}

export interface ToolExecutionResult {
  readonly response: Record<string, unknown>;
  readonly citedParts: readonly PartCitation[];
  /**
   * True only when this call established, for ONE specific vehicle, that a
   * part is on record as fitting it. `agent-loop.ts` uses this to check the
   * final reply: a reply that says "fits" when no tool call this turn set
   * this is making a claim the data doesn't back.
   */
  readonly confirmedFit?: boolean;
}

/** "SUZUKI ALTO HA36S (2014-2021)" — plain ASCII hyphen on purpose (see `normaliseDashes`). */
export function vehicleLabel(v: Pick<Vehicle, 'make' | 'model' | 'chassisCode' | 'yearFrom' | 'yearTo'>): string {
  const years =
    v.yearFrom !== null || v.yearTo !== null ? ` (${v.yearFrom ?? '?'}-${v.yearTo ?? 'on'})` : '';
  // The original price lists only named make + model, so some vehicles have
  // no chassis code or years at all. Said plainly — unlabelled, the model
  // invented "(other years)" to explain the bare "TOYOTA COROLLA" row.
  const detail = v.chassisCode ? ` ${v.chassisCode}` : years === '' ? ' (model not specified)' : '';
  return `${v.make} ${v.model}${detail}${years}`;
}

interface VehicleResolution {
  readonly vehicles: Vehicle[];
  /** Set when a year was given but matched none of the otherwise-matching vehicles. */
  readonly yearUnmatched: boolean;
}

/**
 * Customer words → candidate vehicles. Partial, case-insensitive. A year
 * narrows the candidates by their production range (open ends match), but
 * if it would narrow them to nothing the candidates are kept and the
 * mismatch is reported instead — "a 2013 Alto" shouldn't become "no such
 * vehicle" when the shop has two Altos on file either side of it.
 */
export async function resolveVehicles(desc: VehicleDescription): Promise<VehicleResolution> {
  if (desc.make === undefined && desc.model === undefined && desc.chassisCode === undefined) {
    throw new ToolArgumentError('describe the vehicle: at least a make, a model, or a chassis code');
  }
  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(desc.make !== undefined ? { make: { contains: desc.make, mode: 'insensitive' } } : {}),
      ...(desc.model !== undefined ? { model: { contains: desc.model, mode: 'insensitive' } } : {}),
      ...(desc.chassisCode !== undefined ? { chassisCode: { contains: desc.chassisCode, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ make: 'asc' }, { model: 'asc' }, { yearFrom: 'asc' }],
    take: 10,
  });
  if (desc.year === undefined) return { vehicles, yearUnmatched: false };

  const year = desc.year;
  const inRange = vehicles.filter((v) => (v.yearFrom === null || v.yearFrom <= year) && (v.yearTo === null || v.yearTo >= year));
  return inRange.length > 0 ? { vehicles: inRange, yearUnmatched: false } : { vehicles, yearUnmatched: true };
}

const ASK_WHICH =
  'The customer has not said which one they have. Do NOT say any part fits their vehicle. Show the facts per variant, then ask which one is theirs — the chassis code is on the revenue licence and the plate in the engine bay, or the year helps.';

const NOT_FOUND =
  'No vehicle on record matches that description. Say so plainly, ask for the chassis code (on the revenue licence), or suggest calling the shop. Do not suggest parts as fitting.';

/**
 * Which of a vehicle's on-record parts match the kind of part asked for
 * ("oil filter"). Cut-offs measured 2026-10-11 on real queries, not picked:
 *   "oil filter" / Alto:   oil filter 0.350, AIR filter 0.389, brake shoe 0.468
 *   "brake pads" / Corolla: two pad sets 0.330 + 0.337, brake SHOE 0.366
 *   "air filter" / Hiace:  air filter 0.344, fuel filter 0.394
 *   "u joint" / Hiace:     two U-joints both 0.319 (a real choice — keep both)
 * Neighbouring kinds of part sit only ~0.03-0.04 behind the right one, so
 * "top N" can't work — it listed the Alto's air filter as an oil filter.
 * Keep what's within MARGIN of the best match; if even the best is worse
 * than MAX_DISTANCE, nothing of that kind is on record for the vehicle.
 * Revisit both numbers if the embedding model or embedding text changes.
 */
const MATCH_MARGIN = 0.03;
const MATCH_MAX_DISTANCE = 0.4;

async function partsMatchingQuery(partQuery: string, partIds: readonly string[]): Promise<Set<string>> {
  const [vector] = await embedTexts([partQuery], 'RETRIEVAL_QUERY');
  if (vector === undefined) throw new Error('embedTexts returned no vector for partQuery');
  const ranked = await distancesForParts(vector, partIds);
  const best = ranked[0]?.distance;
  if (best === undefined || best > MATCH_MAX_DISTANCE) return new Set();
  return new Set(ranked.filter((r) => r.distance <= best + MATCH_MARGIN).map((r) => r.partId));
}

function citationOf(p: { id: string; partNumber: string | null; rawName: string }): PartCitation {
  return { partId: p.id, partNumber: p.partNumber, rawName: p.rawName };
}

export async function executeTool(name: string, rawArgs: Record<string, unknown>): Promise<ToolExecutionResult> {
  switch (name) {
    case 'search_parts': {
      const { query, limit } = searchPartsArgs.parse(rawArgs);
      const hits = await hybridPartSearch(query, limit ?? 5);
      return {
        response: {
          // Deliberately no availabilityStatus/freshness here — customers are
          // told to call or visit to check stock, never told a status by the
          // agent (see the system prompt and PLAN.md §5/§7). Stripping the
          // field from the tool's own response, rather than just telling the
          // model not to mention it, means it's structurally impossible for
          // the agent to state or imply stock even if the prompt is ignored.
          hits: hits.map((h) => ({
            partId: h.partId,
            partNumber: h.partNumber,
            rawName: h.rawName,
            brandName: h.brandName,
            categoryName: h.categoryName,
            matchType: h.matchType,
          })),
          note: 'A part name mentioning a vehicle is not a fitment check. To say a part fits a vehicle, use check_part_fits.',
        },
        citedParts: hits.map((h) => ({ partId: h.partId, partNumber: h.partNumber, rawName: h.rawName })),
      };
    }

    case 'check_part_fits': {
      const { partId, ...desc } = checkPartFitsArgs.parse(rawArgs);
      // Accepts the part number too. On a follow-up turn the model only has
      // the previous reply's *text* (the frontend replays role/content, not
      // tool results), so it naturally passes "16510-81420" — traced: that
      // failed id validation and cost a whole extra search round to recover.
      const part = z.uuid().safeParse(partId).success
        ? await prisma.part.findUnique({ where: { id: partId } })
        : await prisma.part.findFirst({ where: { partNumber: { equals: partId.trim(), mode: 'insensitive' } } });
      if (part === null) throw new ToolArgumentError(`no part with id or part number ${partId}`);
      const { vehicles, yearUnmatched } = await resolveVehicles(desc);
      const cited = [citationOf(part)];
      const partInfo = { partNumber: part.partNumber, rawName: part.rawName };

      if (vehicles.length === 0) {
        return { response: { status: 'VEHICLE_NOT_FOUND', part: partInfo, tellCustomer: NOT_FOUND }, citedParts: cited };
      }

      const checks = await Promise.all(vehicles.map(async (v) => ({ v, result: await checkFitment(part.id, v.id) })));

      // Only ask "which one?" when the answer would actually differ. Traced:
      // a Corolla brake pad vs "my hiace" was NO_MATCH for all three Hiaces
      // on file, and the agent still asked which Hiace they had.
      const verdicts = new Set(checks.map(({ result }) => result.verdict));
      if (vehicles.length > 1 && verdicts.size === 1) {
        const labels = checks.map(({ v }) => vehicleLabel(v));
        const verdict = [...verdicts][0]!;
        return {
          response: {
            status: verdict === 'CONFIRMED' ? 'LISTED_FOR_ALL' : verdict,
            part: partInfo,
            vehiclesChecked: labels,
            tellCustomer:
              verdict === 'CONFIRMED'
                ? 'Say it is listed for every one of these variants we have on record, and to confirm their chassis code when buying in case theirs is a different one.'
                : verdict === 'NO_MATCH'
                  ? 'Say there is no record of it fitting any of these. No need to ask which one they have.'
                  : 'Say it is NOT confirmed for any of these and they should call the shop before buying.',
          },
          citedParts: cited,
        };
      }

      if (vehicles.length > 1) {
        return {
          response: {
            status: 'NEED_VARIANT',
            part: partInfo,
            variants: checks.map(({ v, result }) => ({ vehicle: vehicleLabel(v), verdict: result.verdict })),
            ...(yearUnmatched ? { yearNote: `None of these is recorded for ${desc.year}.` } : {}),
            tellCustomer: ASK_WHICH,
          },
          citedParts: cited,
        };
      }

      const [{ v, result }] = checks as [(typeof checks)[number]];
      const tellCustomer: Record<FitmentVerdict, string> = {
        CONFIRMED: `Say it is listed as fitting the ${vehicleLabel(v)}.`,
        POSSIBLE: 'Say it is NOT confirmed and they should call the shop before buying. Never phrase it as a yes.',
        NO_MATCH: 'Say there is no record of it fitting this vehicle.',
      };
      return {
        response: {
          status: result.verdict,
          part: partInfo,
          vehicle: vehicleLabel(v),
          reason: result.reason,
          tellCustomer: tellCustomer[result.verdict],
        },
        citedParts: cited,
        confirmedFit: result.verdict === 'CONFIRMED',
      };
    }

    case 'find_parts_for_vehicle': {
      const { partQuery, ...desc } = findPartsForVehicleArgs.parse(rawArgs);
      const { vehicles, yearUnmatched } = await resolveVehicles(desc);
      if (vehicles.length === 0) {
        return { response: { status: 'VEHICLE_NOT_FOUND', tellCustomer: NOT_FOUND }, citedParts: [] };
      }

      const fitmentsPerVehicle = await Promise.all(
        vehicles.map(async (v) => ({ v, partIds: (await findFitmentsForVehicle(v.id)).fitments.map((f) => f.partId) })),
      );
      // Narrow to the kind of part asked for, ranked only among parts on
      // record for these vehicles — see `partsMatchingQuery`.
      const wanted =
        partQuery !== undefined
          ? await partsMatchingQuery(partQuery, [...new Set(fitmentsPerVehicle.flatMap((f) => f.partIds))])
          : null;

      const perVehicle = await Promise.all(
        fitmentsPerVehicle.map(async ({ v, partIds }) => {
          const parts = await prisma.part.findMany({
            where: { id: { in: partIds.filter((id) => wanted === null || wanted.has(id)) } },
            include: { brand: true, category: true },
            orderBy: { rawName: 'asc' },
            take: 12,
          });
          return { v, parts };
        }),
      );
      const allParts = perVehicle.flatMap(({ parts }) => parts);
      const cited = [...new Map(allParts.map((p) => [p.id, citationOf(p)])).values()];
      const brief = (p: (typeof allParts)[number]) => ({
        partId: p.id,
        partNumber: p.partNumber,
        rawName: p.rawName,
        brandName: p.brand?.name ?? null,
        categoryName: p.category.name,
      });

      const withParts = perVehicle.filter(({ parts }) => parts.length > 0);
      const partKey = ({ parts }: (typeof perVehicle)[number]) => parts.map((p) => p.id).sort().join(',');

      // Nothing of that kind for any of them: just say so. Traced: "radiator
      // for suzuki alto" listed both Altos as "no radiator found" and then
      // asked which Alto they had — an answer that changes nothing.
      if (vehicles.length > 1 && withParts.length === 0) {
        return {
          response: {
            status: 'NONE_ON_RECORD',
            vehiclesChecked: perVehicle.map(({ v }) => vehicleLabel(v)),
            tellCustomer: `Say we have no ${partQuery ?? 'parts'} on record for any of these, and suggest calling the shop. No need to ask which one they have.`,
          },
          citedParts: [],
        };
      }

      // The same parts for every variant: the answer doesn't depend on
      // which one they have, so give it — without saying "fits *your* car",
      // since theirs could be a variant the shop has no record of.
      if (vehicles.length > 1 && withParts.length === perVehicle.length && new Set(perVehicle.map(partKey)).size === 1) {
        return {
          response: {
            status: 'LISTED_FOR_ALL',
            vehiclesChecked: perVehicle.map(({ v }) => vehicleLabel(v)),
            parts: perVehicle[0]!.parts.map(brief),
            tellCustomer:
              'Say these are listed for every one of these variants we have on record, and to confirm their chassis code when buying in case theirs is a different one.',
          },
          citedParts: cited,
        };
      }

      if (vehicles.length > 1) {
        return {
          response: {
            status: 'NEED_VARIANT',
            // Only variants that have something; the rest summarised in one
            // line, so the reply isn't a list of "none" rows.
            variants: withParts.map(({ v, parts }) => ({ vehicle: vehicleLabel(v), parts: parts.map((p) => p.partNumber ?? p.rawName) })),
            notListedFor: perVehicle.filter(({ parts }) => parts.length === 0).map(({ v }) => vehicleLabel(v)),
            ...(yearUnmatched ? { yearNote: `None of these is recorded for ${desc.year}.` } : {}),
            tellCustomer: ASK_WHICH,
          },
          citedParts: cited,
        };
      }

      const [{ v, parts }] = perVehicle as [(typeof perVehicle)[number]];
      if (parts.length === 0) {
        return {
          response: {
            status: 'NONE_ON_RECORD',
            vehicle: vehicleLabel(v),
            tellCustomer: `Say we have no ${partQuery ?? 'parts'} on record for the ${vehicleLabel(v)}, and suggest calling the shop.`,
          },
          citedParts: [],
        };
      }

      // A real choice is several parts of the *same kind* for one vehicle
      // (PLAN.md §7's Canter case: three U-joints that differ only by
      // size). An oil filter plus brake pads for the same car is not a
      // choice — the old "more than one part = ambiguous" rule, written for
      // a U-joint-only catalogue, flagged every vehicle once other
      // categories existed.
      const perCategory = new Map<string, number>();
      for (const p of parts) perCategory.set(p.category.name, (perCategory.get(p.category.name) ?? 0) + 1);
      const choices = [...perCategory].filter(([, n]) => n > 1).map(([c]) => c);

      return {
        response: {
          status: 'FOUND',
          vehicle: vehicleLabel(v),
          parts: parts.map(brief),
          tellCustomer:
            `Say these are listed for the ${vehicleLabel(v)}.` +
            (choices.length > 0
              ? ` Several ${choices.join(', ')} options are listed — they differ in size/spec, so the shop must confirm which (bring the old part). Never pick one.`
              : ''),
        },
        citedParts: cited,
        confirmedFit: true,
      };
    }

    default:
      throw new ToolNotFoundError(`unknown tool: ${name}`);
  }
}
