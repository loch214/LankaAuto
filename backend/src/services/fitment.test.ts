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

  it('returns POSSIBLE when attributes overlap but nothing is asserted', async () => {
    // GUT12's attributes are {make: TOYOTA, model: [HIACE]}. A Corolla is a
    // real, different TOYOTA vehicle with no fitment asserted for GUT12 —
    // make overlaps, model does not.
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'TOYOTA', model: 'COROLLA' } });

    const asserted = await prisma.partFitment.findUnique({
      where: { partId_vehicleId: { partId: part.id, vehicleId: vehicle.id } },
    });
    expect(asserted).toBeNull(); // sanity check on the test's own premise

    const result = await checkFitment(part.id, vehicle.id);
    expect(result.verdict).toBe('POSSIBLE');
    expect(result.matchedAttributes).toEqual(['make']);
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
