/**
 * Phase 4 (PLAN.md §10) — fitment logic. This is what the future agent's
 * `check_fitment(part_id, vehicle_id)` tool (PLAN.md §7, tool 3) calls.
 *
 * PLAN.md §6 is explicit that fitment is "a fact you assert and can
 * correct, not a value you recompute" — `part_fitments` is the source of
 * truth, and a lookup against it always wins. Attribute comparison
 * (`Part.attributes` vs `Vehicle` columns) only runs as a fallback when
 * nothing has been asserted, and it can never produce a confident "yes" —
 * only "no asserted fitment, but here's what overlaps; confirm with the
 * shop." Collapsing that distinction into a single boolean would be exactly
 * the fabrication PLAN.md §7's grounding rule forbids.
 */
import type { FitmentSource } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { parseEmbeddingAttributes } from '../ingest/build-embedding-text.js';

export type FitmentVerdict = 'CONFIRMED' | 'POSSIBLE' | 'NO_MATCH';

export interface FitmentResult {
  readonly verdict: FitmentVerdict;
  /** Human-readable, citable explanation — this is what the agent would say. */
  readonly reason: string;
  /** Only set for CONFIRMED: which record backs the claim. */
  readonly fitmentSource?: FitmentSource;
  readonly fitmentNotes?: string | null;
  /** Only set for POSSIBLE: which attribute fields actually overlapped. */
  readonly matchedAttributes?: readonly string[];
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

/**
 * Single part × single vehicle. Three-tier answer, never a plain boolean:
 *
 * 1. **CONFIRMED** — an asserted `part_fitments` row exists for this exact
 *    pair. This is the only tier allowed to say yes outright.
 * 2. **POSSIBLE** — no assertion, but `Part.attributes` (make/model/
 *    chassisCode/engine — the same parsed spans `build-embedding-text.ts`
 *    reads) overlaps with the vehicle's own fields. Named fields only, so
 *    the "why" is always inspectable, never a similarity score. A match on
 *    make *alone* does not qualify when the part names its own models — see
 *    the long comment at that branch below.
 * 3. **NO_MATCH** — no assertion and either no attribute overlap at all, or
 *    only a shared manufacturer on a part that lists specific models.
 */
export async function checkFitment(partId: string, vehicleId: string): Promise<FitmentResult> {
  const asserted = await prisma.partFitment.findUnique({
    where: { partId_vehicleId: { partId, vehicleId } },
  });

  if (asserted !== null) {
    return {
      verdict: 'CONFIRMED',
      reason: `Fitment is on record (source: ${asserted.source === 'STAFF' ? 'confirmed by staff' : 'ingested from the price list'}).`,
      fitmentSource: asserted.source,
      fitmentNotes: asserted.notes,
    };
  }

  const [part, vehicle] = await Promise.all([
    prisma.part.findUniqueOrThrow({ where: { id: partId } }),
    prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }),
  ]);

  const attrs = parseEmbeddingAttributes(part.attributes);
  const partMakes = uniq([...(attrs.make !== null && attrs.make !== undefined ? [attrs.make] : []), ...(attrs.inlineMake ?? [])]);

  const matched: string[] = [];
  if (partMakes.includes(vehicle.make)) matched.push('make');
  if ((attrs.model ?? []).includes(vehicle.model)) matched.push('model');
  if (vehicle.chassisCode !== null && (attrs.chassisCode ?? []).includes(vehicle.chassisCode)) {
    matched.push('chassisCode');
  }
  if (vehicle.engineType !== null && (attrs.engine ?? []).includes(vehicle.engineType)) {
    matched.push('engine');
  }

  if (matched.length === 0) {
    return {
      verdict: 'NO_MATCH',
      reason: 'No asserted fitment on record, and this part’s attributes do not overlap with this vehicle.',
    };
  }

  /**
   * A make-only overlap is thrown out when the part itself names the models
   * or chassis codes it is for.
   *
   * "Both are Toyotas" is not evidence a brake pad fits. Worse, when a part
   * enumerates its own models and the vehicle is not among them, that is
   * positive evidence of *non*-fit, not the mere absence of evidence
   * POSSIBLE is meant to express — so answering "possible" there tells a
   * customer "maybe" about something the data already says no to. The agent
   * is required to relay POSSIBLE as a maybe (see `customer-agent.ts`), so
   * this lands in front of the customer rather than staying an internal
   * nuance.
   *
   * Not a hypothetical: measured across 1000 sampled part x vehicle pairs
   * after the sample catalogue was seeded, 242 came back POSSIBLE and 223 of
   * those (92%) matched on nothing but make — e.g. front brake pads for a
   * Corolla ZRE142 reported as POSSIBLE for every Hiace on file. Before the
   * catalogue had more than one brand and one product type this was rare
   * enough not to notice.
   *
   * The `partIsModelSpecific` guard is what keeps this from over-correcting.
   * A part that declares no model and no chassis code at all is a
   * universal-fitting or sold-by-dimension item — a 1.1 bar radiator cap, a
   * 4-pin relay — and for those the make really is the best signal
   * available, so a make-only POSSIBLE is the honest answer and survives.
   */
  const partIsModelSpecific = (attrs.model ?? []).length > 0 || (attrs.chassisCode ?? []).length > 0;
  const onlyMakeMatched = matched.length === 1 && matched[0] === 'make';

  if (onlyMakeMatched && partIsModelSpecific) {
    const listed = uniq([...(attrs.model ?? []), ...(attrs.chassisCode ?? [])]).join(', ');
    return {
      verdict: 'NO_MATCH',
      reason: `No asserted fitment on record. This part is listed for ${listed}, and this vehicle is not among them — sharing a manufacturer is not evidence it fits.`,
    };
  }

  return {
    verdict: 'POSSIBLE',
    reason: `No asserted fitment on record. Attributes suggest a possible match (${matched.join(', ')}) — please confirm with the shop before ordering.`,
    matchedAttributes: matched,
  };
}

export interface VehicleFitmentEntry {
  readonly partId: string;
  readonly partNumber: string | null;
  readonly rawName: string;
  readonly brandName: string | null;
  readonly source: FitmentSource;
  readonly confidence: number;
  readonly notes: string | null;
}

export interface VehicleFitmentsResult {
  readonly vehicleId: string;
  readonly fitments: readonly VehicleFitmentEntry[];
  /**
   * True when more than one distinct part is asserted for this vehicle.
   * This is PLAN.md §7's real, documented case, not a hypothetical: three
   * distinct GMB U-joints (GUM 75 / GUM 87 / GUM 93) are all asserted for
   * "MITSUBISHI CANTER,ROSA," genuinely different parts distinguished by
   * cross diameter × cap length — dimensions the source price list never
   * recorded. There is currently no per-part data to narrow it further, so
   * any vehicle with more than one asserted part is ambiguous by
   * definition until that data exists. The caller (agent or UI) must
   * surface all candidates plus this flag — never silently pick one.
   */
  readonly ambiguous: boolean;
}

/** The vehicle → parts direction: "what fits my Canter?" */
export async function findFitmentsForVehicle(vehicleId: string): Promise<VehicleFitmentsResult> {
  const rows = await prisma.partFitment.findMany({
    where: { vehicleId },
    include: { part: { include: { brand: true } } },
  });

  const fitments = rows.map((r) => ({
    partId: r.partId,
    partNumber: r.part.partNumber,
    rawName: r.part.rawName,
    brandName: r.part.brand?.name ?? null,
    source: r.source,
    confidence: r.confidence,
    notes: r.notes,
  }));

  const distinctParts = new Set(fitments.map((f) => f.partId));

  return { vehicleId, fitments, ambiguous: distinctParts.size > 1 };
}
