import { describe, it, expect, afterAll } from 'vitest';
import { prisma, disconnect } from '../lib/prisma.js';
import { checkFitment, findFitmentsForVehicle } from './fitment.js';

// Runs against the real dev database, same as `find-part-by-number.test.ts`
// and `routes/parts.test.ts` — fitment lookups are joins over real ingested
// rows, not something worth mocking. Looked up by (part number) / (make,
// model) rather than hardcoded ids, since ids are random per `db:reset`.
describe('checkFitment', () => {
  afterAll(async () => {
    await disconnect();
  });

  it('returns CONFIRMED when part_fitments has an asserted row', async () => {
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const fitment = await prisma.partFitment.findFirstOrThrow({ where: { partId: part.id } });
    const result = await checkFitment(part.id, fitment.vehicleId);
    expect(result.verdict).toBe('CONFIRMED');
    expect(result.fitmentSource).toBe('INGESTED');
  });

  it('returns POSSIBLE when a model-specific attribute overlaps but nothing is asserted', async () => {
    // GUT12's attributes are {make: TOYOTA, model: [HIACE]}. Every Hiace on
    // file beyond the one GUT12 actually asserts a fitment for overlaps on
    // BOTH make and model, which is real signal — but no row asserts it.
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const asserted = await prisma.partFitment.findMany({ where: { partId: part.id } });
    const assertedIds = new Set(asserted.map((f) => f.vehicleId));
    const vehicle = await prisma.vehicle.findFirstOrThrow({
      where: { make: 'TOYOTA', model: 'HIACE', id: { notIn: [...assertedIds] } },
    });

    const result = await checkFitment(part.id, vehicle.id);
    expect(result.verdict).toBe('POSSIBLE');
    expect(result.matchedAttributes).toEqual(['make', 'model']);
  });

  /**
   * The counterpart to the test above, and the reason `checkFitment` has a
   * `partIsModelSpecific` guard: GUT12 says it is for a HIACE. A COROLLA is
   * a different Toyota, so the only thing that overlaps is the manufacturer
   * — which is not evidence a driveline part fits, and the part enumerating
   * its models is positive evidence against it. Answering POSSIBLE here put
   * a "maybe" in front of customers for 92% of all POSSIBLE verdicts once
   * the catalogue held more than one product type.
   */
  it('returns NO_MATCH when only the manufacturer overlaps and the part lists specific models', async () => {
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'TOYOTA', model: 'COROLLA' } });

    const asserted = await prisma.partFitment.findUnique({
      where: { partId_vehicleId: { partId: part.id, vehicleId: vehicle.id } },
    });
    expect(asserted).toBeNull(); // sanity check on the test's own premise

    const result = await checkFitment(part.id, vehicle.id);
    expect(result.verdict).toBe('NO_MATCH');
    expect(result.reason).toContain('sharing a manufacturer is not evidence');
  });

  /**
   * ...but a part that names no model or chassis code at all is a
   * universal-fitting item — a radiator cap, a 4-pin relay — and for those
   * the make is the only signal there is, so a make-only POSSIBLE has to
   * survive. Without this the guard above would over-correct into calling
   * every universal part a NO_MATCH.
   *
   * Builds its own part rather than borrowing one from the sample catalogue:
   * that data is explicitly purgeable (`npm run seed:sample -- --purge`),
   * and a test that fails after a purge would be blaming the wrong thing.
   */
  it('still returns POSSIBLE on a make-only overlap when the part names no specific model', async () => {
    const category = await prisma.category.findFirstOrThrow();
    const unique = `FITMENT-TEST-${Date.now()}`;
    const part = await prisma.part.create({
      data: {
        categoryId: category.id,
        rawName: 'TEST UNIVERSAL RADIATOR CAP TESTMAKE',
        normalizedName: 'TEST UNIVERSAL RADIATOR CAP TESTMAKE',
        partNumber: unique,
        // The shape that matters: a make, and no model or chassis code.
        attributes: { make: 'TESTMAKE', model: [], chassisCode: [] },
        parseConfidence: 1,
        parseSource: 'MANUAL',
        sourceKey: unique,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: { make: 'TESTMAKE', model: 'TESTMODEL', identityKey: unique },
    });

    try {
      const result = await checkFitment(part.id, vehicle.id);
      expect(result.verdict).toBe('POSSIBLE');
      expect(result.matchedAttributes).toEqual(['make']);
    } finally {
      await prisma.part.delete({ where: { id: part.id } });
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
    }
  });

  it('returns NO_MATCH when neither an assertion nor attributes overlap', async () => {
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } }); // TOYOTA
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'ISUZU' } });

    const result = await checkFitment(part.id, vehicle.id);
    expect(result.verdict).toBe('NO_MATCH');
  });
});

describe('findFitmentsForVehicle', () => {
  afterAll(async () => {
    await disconnect();
  });

  it('flags a genuinely ambiguous vehicle — the Mitsubishi Canter case (PLAN.md §7)', async () => {
    // Real, documented data: GUM 75 / GUM 87 / GUM 93 all assert fitment for
    // MITSUBISHI CANTER, and nothing in the source data distinguishes them.
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'MITSUBISHI', model: 'CANTER' } });
    const result = await findFitmentsForVehicle(vehicle.id);
    expect(result.fitments.length).toBeGreaterThan(1);
    expect(result.ambiguous).toBe(true);
  });

  it('does not flag a vehicle with exactly one asserted part', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'TOYOTA', model: 'CORONA' } });
    const result = await findFitmentsForVehicle(vehicle.id);
    expect(result.fitments.length).toBe(1);
    expect(result.ambiguous).toBe(false);
  });

  it('returns an empty, non-ambiguous result for a vehicle with no fitments', async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'TESTMAKE',
        model: 'TESTMODEL',
        identityKey: `TESTMAKE|TESTMODEL|${Date.now()}`,
      },
    });
    try {
      const result = await findFitmentsForVehicle(vehicle.id);
      expect(result.fitments).toEqual([]);
      expect(result.ambiguous).toBe(false);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
    }
  });
});
