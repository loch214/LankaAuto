import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword, signStaffToken, verifyStaffToken } from './auth.js';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: a hashed password verifies against the original plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('never stores the plaintext in the hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
  });

  it('salts: hashing the same password twice produces different hashes', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });
});

describe('signStaffToken / verifyStaffToken', () => {
  it('round-trips the user id and role', () => {
    const token = signStaffToken({ id: 'user-1', role: 'STAFF' });
    const payload = verifyStaffToken(token);
    expect(payload).toEqual({ sub: 'user-1', role: 'STAFF' });
  });

  it('rejects a garbage token rather than throwing', () => {
    expect(verifyStaffToken('not-a-real-token')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    // Simulates a forged token, or a token from a different environment
    // whose JWT_SECRET this environment must not trust.
    const forged = jwt.sign({ sub: 'user-1', role: 'ADMIN' }, 'a-different-secret');
    expect(verifyStaffToken(forged)).toBeNull();
  });

  it('distinguishes STAFF from ADMIN in the round-tripped payload', () => {
    const token = signStaffToken({ id: 'user-2', role: 'ADMIN' });
    expect(verifyStaffToken(token)?.role).toBe('ADMIN');
  });
});
