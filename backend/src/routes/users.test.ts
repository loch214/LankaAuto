import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { prisma, disconnect } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

// Real dev database, same convention as every other route test in this repo.
const app = createApp();
const request = supertest(app);

const ADMIN_USERNAME = 'users-test-admin';
const STAFF_USERNAME = 'users-test-staff';
const TEST_PASSWORD = 'correct horse battery staple';
const NAMESPACE_PREFIX = 'users-test-';

let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: { name: 'Users Test Admin', username: ADMIN_USERNAME, passwordHash, role: 'ADMIN' },
    update: { passwordHash, role: 'ADMIN', isActive: true },
  });
  await prisma.user.upsert({
    where: { username: STAFF_USERNAME },
    create: { name: 'Users Test Staff', username: STAFF_USERNAME, passwordHash, role: 'STAFF' },
    update: { passwordHash, role: 'STAFF', isActive: true },
  });

  const adminLogin = await request.post('/auth/login').send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
  adminToken = adminLogin.body.token;
  const staffLogin = await request.post('/auth/login').send({ username: STAFF_USERNAME, password: TEST_PASSWORD });
  staffToken = staffLogin.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: NAMESPACE_PREFIX } } });
  await disconnect();
});

describe('GET /users', () => {
  it('rejects a STAFF token with 403', async () => {
    const res = await request.get('/users').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it('lists accounts for an ADMIN token, never including passwordHash', async () => {
    const res = await request.get('/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    const mine = res.body.users.find((u: { username: string }) => u.username === ADMIN_USERNAME);
    expect(mine).toBeDefined();
    expect(mine.passwordHash).toBeUndefined();
  });
});

describe('POST /users', () => {
  it('rejects a STAFF token with 403', async () => {
    const res = await request
      .post('/users')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ username: `${NAMESPACE_PREFIX}nope`, name: 'Nope', password: 'irrelevant1' });
    expect(res.status).toBe(403);
  });

  it('creates a STAFF account by default, and the account can log in', async () => {
    const username = `${NAMESPACE_PREFIX}newhire`;
    const res = await request
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username, name: 'New Hire', password: 'a-real-password' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('STAFF');
    expect(res.body.passwordHash).toBeUndefined();

    const login = await request.post('/auth/login').send({ username, password: 'a-real-password' });
    expect(login.status).toBe(200);
  });

  it('409s on a duplicate username', async () => {
    const res = await request
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: ADMIN_USERNAME, name: 'Dup', password: 'a-real-password' });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /users/:id — lockout guards', () => {
  it('an admin cannot deactivate their own account', async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { username: ADMIN_USERNAME } });
    const res = await request
      .patch(`/users/${me.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('cannot demote or deactivate the last active admin, even by a different caller', async () => {
    // Namespace this test's admins so it doesn't fight the real seeded admin.
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const soleAdmin = await prisma.user.upsert({
      where: { username: `${NAMESPACE_PREFIX}sole-admin` },
      create: { name: 'Sole', username: `${NAMESPACE_PREFIX}sole-admin`, passwordHash, role: 'ADMIN' },
      update: { role: 'ADMIN', isActive: true },
    });
    // Deactivate every other admin so soleAdmin is genuinely the last one,
    // then restore afterwards.
    const others = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, id: { not: soleAdmin.id } } });
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: false } });

    try {
      const res = await request
        .patch(`/users/${soleAdmin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'STAFF' });
      expect(res.status).toBe(400);
    } finally {
      await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: true } });
    }
  });

  it('resets a password, and the new password logs in', async () => {
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF_USERNAME } });
    const res = await request
      .patch(`/users/${staff.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'a-brand-new-password' });
    expect(res.status).toBe(200);

    const login = await request
      .post('/auth/login')
      .send({ username: STAFF_USERNAME, password: 'a-brand-new-password' });
    expect(login.status).toBe(200);
  });
});

describe('DELETE /users/:id', () => {
  it('an admin cannot delete their own account', async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { username: ADMIN_USERNAME } });
    const res = await request.delete(`/users/${me.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('deletes a staff account, and their old verification log rows survive with a null user', async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const doomed = await prisma.user.create({
      data: { name: 'Doomed', username: `${NAMESPACE_PREFIX}doomed`, passwordHash, role: 'STAFF' },
    });
    const part = await prisma.part.findFirstOrThrow();
    const log = await prisma.verificationLog.create({
      data: { partId: part.id, userId: doomed.id, oldStatus: part.availabilityStatus, newStatus: 'LOW' },
    });

    const res = await request.delete(`/users/${doomed.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const survivingLog = await prisma.verificationLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(survivingLog.userId).toBeNull();
  });
});
