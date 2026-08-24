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

describe('PATCH /parts/:id/availability', () => {
  const TEST_EMAIL = 'availability-test-staff@lankaauto.local';
  const TEST_PASSWORD = 'correct horse battery staple';
  let staffToken: string;

  beforeAll(async () => {
    const { hashPassword } = await import('../lib/auth.js');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      create: { name: 'Availability Test Staff', email: TEST_EMAIL, passwordHash, role: 'STAFF' },
      update: { passwordHash, role: 'STAFF', isActive: true },
    });
    const login = await request.post('/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    staffToken = login.body.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
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
});
