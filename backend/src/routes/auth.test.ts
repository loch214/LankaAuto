import { describe, it, expect, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { prisma, disconnect } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

const request = supertest(createApp());

const TEST_USERNAME = 'auth-test-staff';
const TEST_PASSWORD = 'correct horse battery staple';

async function seedTestUser(overrides: Partial<{ isActive: boolean; role: 'STAFF' | 'ADMIN' }> = {}) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return prisma.user.upsert({
    where: { username: TEST_USERNAME },
    create: {
      name: 'Auth Test Staff',
      username: TEST_USERNAME,
      passwordHash,
      role: overrides.role ?? 'STAFF',
      isActive: overrides.isActive ?? true,
    },
    update: {
      passwordHash,
      role: overrides.role ?? 'STAFF',
      isActive: overrides.isActive ?? true,
    },
  });
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
  await disconnect();
});

describe('POST /auth/login', () => {
  it('logs in with the correct username and password, returning a usable token', async () => {
    await seedTestUser();
    const res = await request.post('/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.username).toBe(TEST_USERNAME);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects the wrong password with 401', async () => {
    await seedTestUser();
    const res = await request.post('/auth/login').send({ username: TEST_USERNAME, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects a username that does not exist, with the same message as a wrong password', async () => {
    const res = await request.post('/auth/login').send({ username: 'nobody', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid username or password');
  });

  it('rejects a deactivated account even with the correct password', async () => {
    await seedTestUser({ isActive: false });
    const res = await request.post('/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('400s on a malformed request body rather than 500ing', async () => {
    const res = await request.post('/auth/login').send({ username: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me', () => {
  it('returns the user for a valid token', async () => {
    await seedTestUser();
    const login = await request.post('/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    const res = await request.get('/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe(TEST_USERNAME);
  });

  it('401s with no Authorization header', async () => {
    const res = await request.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('401s with a garbage token', async () => {
    const res = await request.get('/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
