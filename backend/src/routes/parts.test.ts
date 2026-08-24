import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { prisma, disconnect } from '../lib/prisma.js';

// These run against the real dev database (docker-compose `lankaauto-db`),
// same as `check-db.ts` and the ingestion script — no mocked Prisma client.
// The GMB U-joint list (Milestone 1B) is expected to already be ingested;
// if `parts` is empty, `npm run ingest:gmb-ujoint` first.
const app = createApp();
const request = supertest(app);

describe('GET /parts', () => {
  let seededCount = 0;

  beforeAll(async () => {
    seededCount = await prisma.part.count();
  });

  afterAll(async () => {
    await disconnect();
  });

  it('returns every part when q is omitted, capped by the default limit', async () => {
    const res = await request.get('/parts');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(seededCount);
    expect(res.body.parts.length).toBe(Math.min(seededCount, 20));
  });

  it('finds a known GMB part by description substring, case-insensitive', async () => {
    const res = await request.get('/parts').query({ q: 'hiace' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const part of res.body.parts) {
      expect(part.normalizedName).toContain('HIACE');
    }
  });

  it('finds a part by part number regardless of spacing', async () => {
    const res = await request.get('/parts').query({ q: 'gut 12' });
    expect(res.status).toBe(200);
    expect(res.body.parts.some((p: { partNumber: string }) => p.partNumber === 'GUT12')).toBe(true);
  });

  it('treats % in the query as a literal character, not a wildcard', async () => {
    const res = await request.get('/parts').query({ q: '%' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('rejects a limit above the cap with a 400, not a silent clamp', async () => {
    const res = await request.get('/parts').query({ limit: '500' });
    expect(res.status).toBe(400);
  });

  it('paginates with limit/offset', async () => {
    const page1 = await request.get('/parts').query({ limit: 5, offset: 0 });
    const page2 = await request.get('/parts').query({ limit: 5, offset: 5 });
    expect(page1.body.parts.length).toBeGreaterThan(0);
    const ids1 = page1.body.parts.map((p: { id: string }) => p.id);
    const ids2 = page2.body.parts.map((p: { id: string }) => p.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });
});

describe('GET /parts/:id', () => {
  it('returns full detail including attributes and vehicle fitments', async () => {
    const seed = await prisma.part.findFirst({ where: { fitments: { some: {} } } });
    expect(seed).not.toBeNull();

    const res = await request.get(`/parts/${seed!.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seed!.id);
    expect(res.body.attributes).toBeDefined();
    expect(res.body.fitments.length).toBeGreaterThan(0);
    expect(res.body.fitments[0].vehicle.make).toBeDefined();
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const res = await request.get('/parts/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed id rather than a 500', async () => {
    const res = await request.get('/parts/not-a-uuid');
    expect(res.status).toBe(400);
  });
});
