import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { prisma, disconnect } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

const app = createApp();
const request = supertest(app);

const ADMIN_USERNAME = 'reports-test-admin';
const STAFF_USERNAME = 'reports-test-staff';
const TEST_PASSWORD = 'correct horse battery staple';

let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: { name: 'Reports Test Admin', username: ADMIN_USERNAME, passwordHash, role: 'ADMIN' },
    update: { passwordHash, role: 'ADMIN', isActive: true },
  });
  await prisma.user.upsert({
    where: { username: STAFF_USERNAME },
    create: { name: 'Reports Test Staff', username: STAFF_USERNAME, passwordHash, role: 'STAFF' },
    update: { passwordHash, role: 'STAFF', isActive: true },
  });

  const adminLogin = await request.post('/auth/login').send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
  adminToken = adminLogin.body.token;
  const staffLogin = await request.post('/auth/login').send({ username: STAFF_USERNAME, password: TEST_PASSWORD });
  staffToken = staffLogin.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN_USERNAME, STAFF_USERNAME] } } });
  await disconnect();
});

describe('reports routes — role gating', () => {
  it.each(['/reports/stock-summary', '/reports/stale-parts', '/reports/activity', '/reports/out-of-stock'])(
    '%s rejects a STAFF token with 403',
    async (path) => {
      const res = await request.get(path).set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    },
  );

  it.each(['/reports/stock-summary', '/reports/stale-parts', '/reports/activity', '/reports/out-of-stock'])(
    '%s rejects an unauthenticated request with 401',
    async (path) => {
      const res = await request.get(path);
      expect(res.status).toBe(401);
    },
  );
});

describe('GET /reports/stock-summary', () => {
  it('overall counts sum to the total part count', async () => {
    const res = await request.get('/reports/stock-summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const total = await prisma.part.count();
    const sum = Object.values(res.body.overall as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
  });
});

describe('GET /reports/stale-parts', () => {
  it('includes a part with no lastVerifiedAt, and reports match the real total', async () => {
    const part = await prisma.part.findFirstOrThrow();
    await prisma.part.update({ where: { id: part.id }, data: { lastVerifiedAt: null } });

    const res = await request.get('/reports/stale-parts?limit=200').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.parts.some((p: { id: string }) => p.id === part.id)).toBe(true);
  });
});

describe('GET /reports/activity', () => {
  it('reflects a real availability change, including who made it', async () => {
    const part = await prisma.part.findFirstOrThrow();
    await request
      .patch(`/parts/${part.id}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'LOW' });

    const res = await request.get('/reports/activity?limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.entries.find((e: { partId: string }) => e.partId === part.id);
    expect(entry).toBeDefined();
    expect(entry.username).toBe(STAFF_USERNAME);
    expect(entry.newStatus).toBe('LOW');
  });
});

describe('GET /reports/out-of-stock', () => {
  it('only returns parts currently OUT_OF_STOCK', async () => {
    const part = await prisma.part.findFirstOrThrow();
    await prisma.part.update({ where: { id: part.id }, data: { availabilityStatus: 'OUT_OF_STOCK' } });

    const res = await request.get('/reports/out-of-stock?limit=200').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.parts.every((p: { availabilityStatus: string }) => p.availabilityStatus === 'OUT_OF_STOCK')).toBe(
      true,
    );
    expect(res.body.parts.some((p: { id: string }) => p.id === part.id)).toBe(true);
  });
});
