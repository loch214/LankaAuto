import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { prisma, disconnect } from '../../lib/prisma.js';
import { executeTool, ToolArgumentError, ToolNotFoundError } from './tools.js';

// Runs against the real dev database — every tool here wraps a service
// already covered by its own DB-backed tests (hybrid-part-search,
// fitment); this file checks the *wrapping* (arg validation, response
// shape, citation extraction), not the underlying retrieval logic again.
describe('executeTool', () => {
  afterAll(async () => {
    await disconnect();
  });

  it('search_parts returns hits and cites every part it found', async () => {
    const result = await executeTool('search_parts', { query: 'GU1000HD' });
    const hits = result.response['hits'] as unknown[];
    expect(hits.length).toBeGreaterThan(0);
    expect(result.citedParts.some((c) => c.partNumber === 'GU1000HD')).toBe(true);
  });

  it('search_parts rejects a missing query', async () => {
    await expect(executeTool('search_parts', {})).rejects.toThrow();
  });

  // Customers are told to call or visit to check stock (PLAN.md §5/§7,
  // revised 2026-08-26) — the tool must not hand the model anything it
  // could state or imply availability from, not just be told not to.
  it('search_parts never returns availability/freshness to the customer agent', async () => {
    const result = await executeTool('search_parts', { query: 'GU1000HD' });
    const hits = result.response['hits'] as Record<string, unknown>[];
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).not.toHaveProperty('availabilityStatus');
      expect(hit).not.toHaveProperty('freshness');
    }
  });

  /**
   * The 2026-10-11 redesign (see the tools.ts header): the fitment tools take
   * the vehicle as the customer described it and, when that matches more
   * than one vehicle, refuse to give a single verdict. Reproduced before:
   * "Oil filter for Suzuki Alto" matched Alto F8D and HA36S, the model
   * checked only F8D, and told the customer it "fits your Alto (F8D)".
   *
   * Builds throwaway vehicles rather than borrowing seeded ones: the sample
   * catalogue (the only source of chassis codes/years) is purgeable. The
   * parts are GMB U-joints, which are permanent.
   */
  describe('fitment tools resolve the vehicle themselves', () => {
    const tag = `TT${Date.now()}`;
    let partA: { id: string };
    let partB: { id: string };
    let partC: { id: string };
    let older: { id: string };
    let newer: { id: string };

    beforeAll(async () => {
      partA = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
      partB = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GU1000HD' } });
      partC = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GU1100' } }); // on record for neither
      older = await prisma.vehicle.create({
        data: { make: `${tag}MAKE`, model: 'TESTCAR', chassisCode: `${tag}OLD`, yearFrom: 2000, yearTo: 2010, identityKey: `${tag}-old` },
      });
      newer = await prisma.vehicle.create({
        data: { make: `${tag}MAKE`, model: 'TESTCAR', chassisCode: `${tag}NEW`, yearFrom: 2014, yearTo: 2021, identityKey: `${tag}-new` },
      });
      // partA is on record for the older car only; the newer one has two
      // parts of the same kind (both U-joints) — a real choice.
      await prisma.partFitment.createMany({
        data: [
          { partId: partA.id, vehicleId: older.id },
          { partId: partA.id, vehicleId: newer.id },
          { partId: partB.id, vehicleId: newer.id },
        ],
      });
    });

    afterAll(async () => {
      await prisma.vehicle.deleteMany({ where: { id: { in: [older.id, newer.id] } } }); // fitments cascade
    });

    it('check_part_fits: two matching vehicles with different answers → NEED_VARIANT, never a confirmed fit', async () => {
      // partB is on record for the newer car only, so the answer depends on which one they have.
      const result = await executeTool('check_part_fits', { partId: partB.id, make: `${tag}make`, model: 'testcar' });
      expect(result.response['status']).toBe('NEED_VARIANT');
      expect(result.response).not.toHaveProperty('verdict');
      expect((result.response['variants'] as unknown[]).length).toBe(2);
      expect(result.confirmedFit).not.toBe(true);
    });

    it('check_part_fits: same answer for every variant → says it once, no pointless "which one?"', async () => {
      const listed = await executeTool('check_part_fits', { partId: partA.id, make: `${tag}MAKE`, model: 'TESTCAR' });
      expect(listed.response['status']).toBe('LISTED_FOR_ALL');
      expect(listed.confirmedFit).not.toBe(true); // theirs may be a variant not on record

      const neither = await executeTool('check_part_fits', { partId: partC.id, make: `${tag}MAKE`, model: 'TESTCAR' });
      expect(neither.response['status']).toBe('NO_MATCH');
    });

    it('check_part_fits: chassis code alone narrows to one vehicle → CONFIRMED', async () => {
      const result = await executeTool('check_part_fits', { partId: partA.id, chassisCode: `${tag}OLD` });
      expect(result.response['status']).toBe('CONFIRMED');
      expect(result.confirmedFit).toBe(true);
    });

    it('check_part_fits: a year inside one production range narrows to that vehicle', async () => {
      const result = await executeTool('check_part_fits', { partId: partA.id, make: `${tag}MAKE`, model: 'TESTCAR', year: 2016 });
      expect(result.response['vehicle']).toContain(`${tag}NEW`);
    });

    it('check_part_fits: a year matching no range keeps every variant and says so', async () => {
      const result = await executeTool('check_part_fits', { partId: partB.id, make: `${tag}MAKE`, model: 'TESTCAR', year: 2012 });
      expect(result.response['status']).toBe('NEED_VARIANT');
      expect(result.response['yearNote']).toBeDefined();
    });

    it('check_part_fits: accepts a part number in place of the id', async () => {
      const result = await executeTool('check_part_fits', { partId: 'gut12', chassisCode: `${tag}OLD` });
      expect(result.response['status']).toBe('CONFIRMED');
    });

    it('check_part_fits: unknown vehicle → VEHICLE_NOT_FOUND, not a guess', async () => {
      const result = await executeTool('check_part_fits', { partId: partA.id, make: `${tag}NOSUCHMAKE` });
      expect(result.response['status']).toBe('VEHICLE_NOT_FOUND');
      expect(result.confirmedFit).not.toBe(true);
    });

    it('find_parts_for_vehicle: two matching vehicles → NEED_VARIANT with per-variant parts', async () => {
      const result = await executeTool('find_parts_for_vehicle', { make: `${tag}MAKE`, model: 'TESTCAR' });
      expect(result.response['status']).toBe('NEED_VARIANT');
      expect(result.confirmedFit).not.toBe(true);
    });

    it('find_parts_for_vehicle: two parts of the same kind for one vehicle → flagged as a choice', async () => {
      const result = await executeTool('find_parts_for_vehicle', { chassisCode: `${tag}NEW` });
      expect(result.response['status']).toBe('FOUND');
      expect((result.response['parts'] as unknown[]).length).toBe(2);
      expect(result.response['tellCustomer']).toMatch(/Never pick one/);
    });

    it('rejects a vehicle description with no make, model or chassis code', async () => {
      await expect(executeTool('check_part_fits', { partId: partA.id })).rejects.toThrow(ToolArgumentError);
    });
  });

  it('rejects an unknown tool name', async () => {
    await expect(executeTool('delete_everything', {})).rejects.toThrow(ToolNotFoundError);
  });
});
