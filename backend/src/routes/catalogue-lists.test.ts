import { describe, it, expect, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../app.js';
import { disconnect } from '../lib/prisma.js';

const request = supertest(createApp());

afterAll(async () => {
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

describe('GET /vehicles', () => {
  it('returns vehicles ordered by make then model', async () => {
    const res = await request.get('/vehicles');
    expect(res.status).toBe(200);
    expect(res.body.vehicles.length).toBeGreaterThan(0);
    const makes = res.body.vehicles.map((v: { make: string }) => v.make);
    expect([...makes].sort()).toEqual(makes);
  });
});
