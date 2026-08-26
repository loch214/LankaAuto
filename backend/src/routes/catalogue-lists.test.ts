import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { disconnect, prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

const request = supertest(createApp());

const TEST_USERNAME = 'catalogue-crud-test-staff';
const TEST_PASSWORD = 'correct horse battery staple';
let staffToken: string;

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.upsert({
    where: { username: TEST_USERNAME },
    create: { name: 'Catalogue CRUD Test Staff', username: TEST_USERNAME, passwordHash, role: 'STAFF' },
    update: { passwordHash, role: 'STAFF', isActive: true },
  });
  const login = await request.post('/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  staffToken = login.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
  await disconnect();
});

describe('GET /categories', () => {
  it('returns the seeded categories', async () => {
    const res = await request.get('/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories.some((c: { slug: string }) => c.slug === 'u-joints')).toBe(true);
  });
});

describe('GET /brands', () => {
  it('returns the seeded brands', async () => {
    const res = await request.get('/brands');
    expect(res.status).toBe(200);
    expect(res.body.brands.some((b: { name: string }) => b.name === 'GMB')).toBe(true);
  });
});

describe('POST/PATCH /categories', () => {
  it('401s with no auth token', async () => {
    const res = await request.post('/categories').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates a category with a derived slug, rejects a duplicate name, then renames it', async () => {
    const create = await request
      .post('/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Test CRUD Category' });
    expect(create.status).toBe(201);
    expect(create.body.slug).toBe('test-crud-category');

    const dup = await request
      .post('/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Test CRUD Category' });
    expect(dup.status).toBe(409);

    const rename = await request
      .patch(`/categories/${create.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Renamed CRUD Category' });
    expect(rename.status).toBe(200);
    expect(rename.body.slug).toBe('renamed-crud-category');

    await prisma.category.delete({ where: { id: create.body.id } });
  });
});

describe('POST/PATCH /brands', () => {
  it('401s with no auth token', async () => {
    const res = await request.post('/brands').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates a brand, rejects a duplicate normalized name, then edits it', async () => {
    const create = await request
      .post('/brands')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Test CRUD Brand', country: 'Sri Lanka' });
    expect(create.status).toBe(201);
    expect(create.body.normalizedName).toBe('TEST CRUD BRAND');

    const dup = await request
      .post('/brands')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'test crud brand' });
    expect(dup.status).toBe(409);

    const edit = await request
      .patch(`/brands/${create.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isOem: true });
    expect(edit.status).toBe(200);
    expect(edit.body.isOem).toBe(true);

    await prisma.brand.delete({ where: { id: create.body.id } });
  });
});

describe('GET /vehicles', () => {
  it('returns vehicles ordered by make then model', async () => {
    const res = await request.get('/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.vehicles.length).toBeGreaterThan(0);
    const makes = res.body.vehicles.map((v: { make: string }) => v.make);
    expect([...makes].sort()).toEqual(makes);
  });
});

describe('GET /vehicles/:id/fitments', () => {
  it('flags the real Mitsubishi Canter ambiguous case (PLAN.md §7)', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { make: 'MITSUBISHI', model: 'CANTER' } });
    const res = await request.get(`/vehicles/${vehicle.id}/fitments`);
    expect(res.status).toBe(200);
    expect(res.body.ambiguous).toBe(true);
    expect(res.body.fitments.length).toBeGreaterThan(1);
  });

  it('returns 404 for a vehicle that does not exist', async () => {
    const res = await request.get('/vehicles/00000000-0000-0000-0000-000000000000/fitments');
    expect(res.status).toBe(404);
  });
});
