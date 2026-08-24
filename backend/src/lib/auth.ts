import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';

// bcrypt's own recommendation as of 2024 — high enough that a stolen hash
// dump is expensive to crack, low enough that login doesn't feel slow on
// ordinary hardware.
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface StaffTokenPayload {
  sub: string;
  role: UserRole;
}

function jwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (secret === undefined || secret === '') {
    // Fail loudly at the call site rather than silently signing with
    // `undefined` — jsonwebtoken would otherwise throw its own less-clear
    // error, or worse, some implementations coerce it to the string
    // "undefined" and mint a token anyone can forge.
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
}

/** 12 hours: long enough for a staff shift, short enough that a lost device isn't a standing risk. */
const TOKEN_TTL = '12h';

export function signStaffToken(user: { id: string; role: UserRole }): string {
  const payload: StaffTokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_TTL });
}

/** Returns null on any invalid/expired/malformed token rather than throwing — callers just check for null. */
export function verifyStaffToken(token: string): StaffTokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret());
    if (typeof decoded !== 'object' || decoded === null || typeof decoded['sub'] !== 'string') {
      return null;
    }
    return { sub: decoded['sub'], role: decoded['role'] as UserRole };
  } catch {
    return null;
  }
}
