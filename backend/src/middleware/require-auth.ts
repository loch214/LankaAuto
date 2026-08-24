import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyStaffToken } from '../lib/auth.js';

// Augment Express's Request so downstream handlers get a typed `req.user`
// instead of every route re-decoding the token or casting `req` itself.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches
 * `req.user`. 401s on anything wrong — missing header, malformed token,
 * expired token — without distinguishing which, so a client can't use the
 * error to probe whether a token almost worked.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (token === undefined) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }

  const payload = verifyStaffToken(token);
  if (payload === null) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
};

/**
 * Gates a route to specific roles. Always follows `requireAuth` (never
 * replaces it) — role-checking a request with no verified identity is a
 * bug, not a permissive default, so this 500s rather than silently
 * allowing through if `req.user` is missing.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (req.user === undefined) {
      throw new Error('requireRole used without requireAuth running first');
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'insufficient permissions' });
      return;
    }
    next();
  };
}
