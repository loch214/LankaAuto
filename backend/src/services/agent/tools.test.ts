import { describe, it, expect, afterAll } from 'vitest';
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

  it('lookup_vehicle finds a real vehicle by partial, case-insensitive make/model', async () => {
    const result = await executeTool('lookup_vehicle', { make: 'toyota', model: 'hiace' });
    const vehicles = result.response['vehicles'] as { make: string; model: string }[];
    expect(vehicles.some((v) => v.make === 'TOYOTA' && v.model === 'HIACE')).toBe(true);
    expect(result.citedParts).toEqual([]); // vehicles aren't parts
  });

  it('lookup_vehicle rejects a call with neither make, model, nor chassis code', async () => {
    await expect(executeTool('lookup_vehicle', {})).rejects.toThrow(ToolArgumentError);
  });

  /**
   * Regression: reproduced live in the browser before this fix. A customer
   * answering the agent's own disambiguation question with just a chassis
   * code ("the CS3, 2003-2007 one") got "I couldn't find a record for a
   * Mitsubishi Lancer CS3" — even though the vehicle it had just listed
   * still existed — because `lookup_vehicle` had no way to search on
   * `chassisCode` at all, only `make`/`model`.
   *
   * Builds its own vehicle rather than borrowing a seeded one: the sample
   * catalogue (the only current source of non-null chassis codes) is
   * explicitly purgeable, and GMB's own 62 rows never carry one at all.
   */
  it('lookup_vehicle finds a vehicle by chassis code alone, with no make or model', async () => {
    const unique = `TOOLS-TEST-CHASSIS-${Date.now()}`;
    const vehicle = await prisma.vehicle.create({
      data: { make: 'TESTMAKE', model: 'TESTMODEL', chassisCode: unique, identityKey: unique },
    });

    try {
      const result = await executeTool('lookup_vehicle', { chassisCode: unique });
      const vehicles = result.response['vehicles'] as { vehicleId: string; chassisCode: string | null }[];
      expect(vehicles.some((v) => v.vehicleId === vehicle.id && v.chassisCode === unique)).toBe(true);
    } finally {
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
    }
  });

  it('check_fitment cites the part it checked and returns a real verdict', async () => {
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const fitment = await prisma.partFitment.findFirstOrThrow({ where: { partId: part.id } });

    const result = await executeTool('check_fitment', { partId: part.id, vehicleId: fitment.vehicleId });
    expect(result.response['verdict']).toBe('CONFIRMED');
    expect(result.citedParts).toEqual([{ partId: part.id, partNumber: 'GUT12', rawName: part.rawName }]);
  });

  it('check_fitment surfaces an unknown part id as a tool argument error, not a crash', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow();
    await expect(
      executeTool('check_fitment', { partId: '00000000-0000-0000-0000-000000000000', vehicleId: vehicle.id }),
    ).rejects.toThrow(ToolArgumentError);
  });

  it('find_vehicle_fitments flags the real Mitsubishi Canter ambiguous case', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'MITSUBISHI', model: 'CANTER' } });
    const result = await executeTool('find_vehicle_fitments', { vehicleId: vehicle.id });
    expect(result.response['ambiguous']).toBe(true);
    expect(result.citedParts.length).toBeGreaterThan(1);
  });

  it('rejects an unknown tool name', async () => {
    await expect(executeTool('delete_everything', {})).rejects.toThrow(ToolNotFoundError);
  });
});
