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

  it('filters by categorySlug, excluding the other category', async () => {
    const res = await request.get('/parts').query({ categorySlug: 'steering-joints' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    for (const part of res.body.parts) {
      expect(part.category.slug).toBe('steering-joints');
    }
  });

  it('filters by brandId', async () => {
    const brand = await prisma.brand.findFirstOrThrow({ where: { name: 'GMB' } });
    const res = await request.get('/parts').query({ brandId: brand.id });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(await prisma.part.count({ where: { brandId: brand.id } }));
  });

  it('filters by vehicleMake and vehicleModel together, matching only that vehicle', async () => {
    const res = await request.get('/parts').query({ vehicleMake: 'toyota', vehicleModel: 'hiace' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);

    const expected = await prisma.part.count({
      where: { fitments: { some: { vehicle: { make: 'TOYOTA', model: 'HIACE' } } } },
    });
    expect(res.body.total).toBe(expected);
  });

  it('combines a category filter with q using AND, not OR', async () => {
    // "hiace" only appears under u-joints in the seeded data, so asking for
    // steering-joints + hiace should return nothing — proving the two
    // filters are ANDed, not OR'd into a broader match.
    const res = await request.get('/parts').query({ categorySlug: 'steering-joints', q: 'hiace' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

describe('GET /parts/search', () => {
  // Exact/fuzzy tiers only — hit the real DB, no network call. The semantic
  // fallback tier calls the real Gemini API (see `services/embeddings.ts`),
  // which this suite deliberately never does (`embeddings.test.ts` stubs
  // `fetch` for exactly that reason); semantic quality is what `npm run eval`
  // is for, against the checked-in eval set.
  it('returns an exact-number hit when the query is a real code', async () => {
    const res = await request.get('/parts/search').query({ q: 'gu 1000 hd' });
    expect(res.status).toBe(200);
    expect(res.body.hits.length).toBeGreaterThan(0);
    expect(res.body.hits[0].matchType).toBe('exact-number');
    expect(res.body.hits[0].partNumber).toBe('GU1000HD');
  });

  it('falls back to a fuzzy-number hit for a near-miss code', async () => {
    const res = await request.get('/parts/search').query({ q: 'GU1000H' });
    expect(res.status).toBe(200);
    expect(res.body.hits.length).toBeGreaterThan(0);
    expect(res.body.hits.every((h: { matchType: string }) => h.matchType === 'fuzzy-number')).toBe(true);
    expect(res.body.hits.some((h: { partNumber: string }) => h.partNumber === 'GU1000HD')).toBe(true);
  });

  it('rejects a blank q with a 400, not an empty-string semantic call', async () => {
    const res = await request.get('/parts/search').query({ q: '' });
    expect(res.status).toBe(400);
  });

  it('caps limit at 20', async () => {
    const res = await request.get('/parts/search').query({ q: 'gu', limit: '500' });
    expect(res.status).toBe(400);
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

describe('GET /parts/:id/fitment-check', () => {
  it('returns CONFIRMED for an asserted part/vehicle pair', async () => {
    const part = await prisma.part.findFirstOrThrow({ where: { partNumber: 'GUT12' } });
    const fitment = await prisma.partFitment.findFirstOrThrow({ where: { partId: part.id } });

    const res = await request.get(`/parts/${part.id}/fitment-check`).query({ vehicleId: fitment.vehicleId });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('CONFIRMED');
  });

  it('returns 404 when the part does not exist', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow();
    const res = await request
      .get('/parts/00000000-0000-0000-0000-000000000000/fitment-check')
      .query({ vehicleId: vehicle.id });
    expect(res.status).toBe(404);
  });

  it('returns 400 when vehicleId is missing', async () => {
    const part = await prisma.part.findFirstOrThrow();
    const res = await request.get(`/parts/${part.id}/fitment-check`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /parts/:id/availability', () => {
  const TEST_USERNAME = 'availability-test-staff';
  const TEST_PASSWORD = 'correct horse battery staple';
  let staffToken: string;

  beforeAll(async () => {
    const { hashPassword } = await import('../lib/auth.js');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.upsert({
      where: { username: TEST_USERNAME },
      create: { name: 'Availability Test Staff', username: TEST_USERNAME, passwordHash, role: 'STAFF' },
      update: { passwordHash, role: 'STAFF', isActive: true },
    });
    const login = await request.post('/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    staffToken = login.body.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
  });

  it('rejects an unauthenticated request with 401', async () => {
    const part = await prisma.part.findFirstOrThrow();
    const res = await request.patch(`/parts/${part.id}/availability`).send({ status: 'IN_STOCK' });
    expect(res.status).toBe(401);
  });

  it('updates status, sets lastVerifiedAt and verifiedSource, and writes a verification log', async () => {
    const part = await prisma.part.findFirstOrThrow();

    const res = await request
      .patch(`/parts/${part.id}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'LOW' });

    expect(res.status).toBe(200);
    expect(res.body.availabilityStatus).toBe('LOW');
    expect(res.body.verifiedSource).toBe('STAFF');
    expect(res.body.lastVerifiedAt).not.toBeNull();

    const log = await prisma.verificationLog.findFirst({
      where: { partId: part.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.newStatus).toBe('LOW');
    expect(log?.oldStatus).toBe(part.availabilityStatus);
  });

  it('rejects an invalid status value with 400', async () => {
    const part = await prisma.part.findFirstOrThrow();
    const res = await request
      .patch(`/parts/${part.id}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'NOT_A_REAL_STATUS' });
    expect(res.status).toBe(400);
  });

  it('404s for a well-formed id that does not exist', async () => {
    const res = await request
      .patch('/parts/00000000-0000-0000-0000-000000000000/availability')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'IN_STOCK' });
    expect(res.status).toBe(404);
  });

  describe('POST /parts/bulk-availability', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const res = await request.post('/parts/bulk-availability').send({ status: 'LOW', dryRun: true });
      expect(res.status).toBe(401);
    });

    it('dry-run reports matched/willChange without writing anything', async () => {
      const category = await prisma.category.findFirstOrThrow({ where: { slug: 'u-joints' } });
      // Put every u-joint into a known, non-target state first so the count
      // is deterministic regardless of what earlier tests in this file did.
      await prisma.part.updateMany({ where: { categoryId: category.id }, data: { availabilityStatus: 'LOW' } });
      const before = await prisma.part.count({ where: { categoryId: category.id, availabilityStatus: 'LOW' } });

      const res = await request
        .post('/parts/bulk-availability')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ categorySlug: 'u-joints', status: 'OUT_OF_STOCK', dryRun: true });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(before);
      expect(res.body.willChange).toBe(before);

      const after = await prisma.part.count({ where: { categoryId: category.id, availabilityStatus: 'LOW' } });
      expect(after).toBe(before);
    });

    it('applies the status to every matched part and writes one log row per part with its real oldStatus', async () => {
      const category = await prisma.category.findFirstOrThrow({ where: { slug: 'steering-joints' } });
      await prisma.part.updateMany({ where: { categoryId: category.id }, data: { availabilityStatus: 'IN_STOCK' } });
      const targets = await prisma.part.findMany({ where: { categoryId: category.id } });

      const res = await request
        .post('/parts/bulk-availability')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ categorySlug: 'steering-joints', status: 'OUT_OF_STOCK', dryRun: false });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(targets.length);

      for (const target of targets) {
        const part = await prisma.part.findUniqueOrThrow({ where: { id: target.id } });
        expect(part.availabilityStatus).toBe('OUT_OF_STOCK');
        expect(part.verifiedSource).toBe('STAFF');

        const log = await prisma.verificationLog.findFirst({
          where: { partId: target.id },
          orderBy: { createdAt: 'desc' },
        });
        expect(log?.newStatus).toBe('OUT_OF_STOCK');
        expect(log?.oldStatus).toBe('IN_STOCK');
      }
    });

    it('skips parts already at the target status (no matches, no writes)', async () => {
      const category = await prisma.category.findFirstOrThrow({ where: { slug: 'steering-joints' } });
      await prisma.part.updateMany({ where: { categoryId: category.id }, data: { availabilityStatus: 'OUT_OF_STOCK' } });

      const res = await request
        .post('/parts/bulk-availability')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ categorySlug: 'steering-joints', status: 'OUT_OF_STOCK', dryRun: false });

      expect(res.status).toBe(400);
    });

    it('rejects a filter matching nothing with 400', async () => {
      const res = await request
        .post('/parts/bulk-availability')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ categorySlug: 'this-slug-does-not-exist', status: 'LOW', dryRun: true });
      expect(res.status).toBe(400);
    });

    // The real dev catalogue (62 parts) is far too small to seed an
    // over-the-cap request end-to-end, so this only pins the exported
    // constant the route enforces against — a change to it should be
    // deliberate, not accidental.
    it('exports the bulk-update cap other tests/UI code can reference', async () => {
      const { BULK_UPDATE_LIMIT } = await import('./parts.js');
      expect(BULK_UPDATE_LIMIT).toBe(5000);
    });
  });
});
