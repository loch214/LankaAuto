/**
 * Tool declarations + execution for the Phase 5 customer agent (PLAN.md §7).
 * Every tool here wraps a service already built and tested in an earlier
 * phase — the agent adds no new retrieval or business logic of its own, it
 * only decides *when* to call what's already there:
 *
 *   - `search_parts`   → `hybridPartSearch` (Phase 3: tools 1+2, exact/
 *     fuzzy part number then semantic description, already merged)
 *   - `lookup_vehicle` → new here: resolves "a Toyota Hiace" to a real
 *     `Vehicle` row/id, since the customer never knows a UUID
 *   - `check_fitment`  / `find_vehicle_fitments` → `fitment.ts` (Phase 4),
 *     unchanged
 *
 * `find_cross_references` and `retrieve_part_notes` (PLAN.md §7, tools 4–5)
 * are deliberately absent — both are cut/deferred (PLAN.md §6), and a tool
 * that always returns nothing is worse than no tool.
 */
import { z } from 'zod';
import type { FunctionDeclaration } from './gemini-client.js';
import { prisma } from '../../lib/prisma.js';
import { hybridPartSearch } from '../hybrid-part-search.js';
import { checkFitment, findFitmentsForVehicle } from '../fitment.js';

export class ToolArgumentError extends Error {}
export class ToolNotFoundError extends Error {}

const searchPartsArgs = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

const lookupVehicleArgs = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

const checkFitmentArgs = z.object({
  partId: z.uuid(),
  vehicleId: z.uuid(),
});

const findVehicleFitmentsArgs = z.object({
  vehicleId: z.uuid(),
});

export const CUSTOMER_TOOLS: readonly FunctionDeclaration[] = [
  {
    name: 'search_parts',
    description:
      "Search the catalogue by part number (exact or approximate) or by a plain-language description of what the customer needs. Always try this first when a customer names a part, a code, or a symptom/need (e.g. 'brake pads for a 2015 Vitz', 'GUT 12', 'something for my Hiace's steering'). Returns each hit's brand, category, and how it matched (exact-number / fuzzy-number / semantic) — matchType tells you how confident to be. Does NOT return stock/availability — this tool never knows it, so never state or imply whether a part is in stock; tell the customer to call or visit the shop to check.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The part number or description to search for.' },
        limit: { type: 'NUMBER', description: 'Max results to return, default 5, max 10.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_vehicle',
    description:
      "Resolve a vehicle the customer mentioned by name (e.g. 'Toyota Hiace', 'Corolla') to catalogue vehicle records with real ids. Call this before check_fitment or find_vehicle_fitments — those need a vehicleId, not a name. Provide make and/or model; partial, case-insensitive matches are fine. May return multiple rows if the name is ambiguous (e.g. several chassis codes) — if so, ask the customer which one, don't guess.",
    parameters: {
      type: 'OBJECT',
      properties: {
        make: { type: 'STRING', description: "Vehicle make, e.g. 'Toyota'." },
        model: { type: 'STRING', description: "Vehicle model, e.g. 'Hiace'." },
      },
    },
  },
  {
    name: 'check_fitment',
    description:
      "Check whether a specific part fits a specific vehicle. Requires real partId and vehicleId (from search_parts and lookup_vehicle — never guess or invent ids). Returns one of three verdicts: CONFIRMED (an asserted fitment record exists — you may say yes), POSSIBLE (no record, but attributes overlap — you must tell the customer this is unconfirmed and suggest calling the shop), or NO_MATCH (no evidence it fits).",
    parameters: {
      type: 'OBJECT',
      properties: {
        partId: { type: 'STRING', description: 'Real part id from a prior search_parts result.' },
        vehicleId: { type: 'STRING', description: 'Real vehicle id from a prior lookup_vehicle result.' },
      },
      required: ['partId', 'vehicleId'],
    },
  },
  {
    name: 'find_vehicle_fitments',
    description:
      "List every part on record as fitting a given vehicle (requires a real vehicleId from lookup_vehicle). If the result's ambiguous flag is true, more than one distinct part is asserted for this vehicle and nothing in the catalogue data distinguishes which one is correct — you MUST list every candidate to the customer and say the shop needs to confirm which one (e.g. by the size of the old part), never pick one yourself.",
    parameters: {
      type: 'OBJECT',
      properties: {
        vehicleId: { type: 'STRING', description: 'Real vehicle id from a prior lookup_vehicle result.' },
      },
      required: ['vehicleId'],
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
        },
        citedParts: hits.map((h) => ({ partId: h.partId, partNumber: h.partNumber, rawName: h.rawName })),
      };
    }

    case 'lookup_vehicle': {
      const { make, model } = lookupVehicleArgs.parse(rawArgs);
      if (make === undefined && model === undefined) {
        throw new ToolArgumentError('lookup_vehicle needs at least a make or a model');
      }
      const vehicles = await prisma.vehicle.findMany({
        where: {
          ...(make !== undefined ? { make: { contains: make, mode: 'insensitive' } } : {}),
          ...(model !== undefined ? { model: { contains: model, mode: 'insensitive' } } : {}),
        },
        take: 10,
      });
      return {
        response: {
          vehicles: vehicles.map((v) => ({
            vehicleId: v.id,
            make: v.make,
            model: v.model,
            chassisCode: v.chassisCode,
            yearFrom: v.yearFrom,
            yearTo: v.yearTo,
          })),
        },
        citedParts: [],
      };
    }

    case 'check_fitment': {
      const { partId, vehicleId } = checkFitmentArgs.parse(rawArgs);
      const part = await prisma.part.findUnique({ where: { id: partId } });
      if (part === null) throw new ToolArgumentError(`no part with id ${partId}`);
      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (vehicle === null) throw new ToolArgumentError(`no vehicle with id ${vehicleId}`);

      const result = await checkFitment(partId, vehicleId);
      return {
        response: { ...result },
        citedParts: [{ partId: part.id, partNumber: part.partNumber, rawName: part.rawName }],
      };
    }

    case 'find_vehicle_fitments': {
      const { vehicleId } = findVehicleFitmentsArgs.parse(rawArgs);
      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (vehicle === null) throw new ToolArgumentError(`no vehicle with id ${vehicleId}`);

      const result = await findFitmentsForVehicle(vehicleId);
      return {
        response: {
          ambiguous: result.ambiguous,
          fitments: result.fitments.map((f) => ({
            partId: f.partId,
            partNumber: f.partNumber,
            rawName: f.rawName,
            brandName: f.brandName,
          })),
        },
        citedParts: result.fitments.map((f) => ({ partId: f.partId, partNumber: f.partNumber, rawName: f.rawName })),
      };
    }

    default:
      throw new ToolNotFoundError(`unknown tool: ${name}`);
  }
}
