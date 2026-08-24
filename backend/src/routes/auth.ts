import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyPassword, signStaffToken } from '../lib/auth.js';
import { requireAuth } from '../middleware/require-auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * POST /auth/login
 *
 * Deliberately returns the same "invalid email or password" message whether
 * the email doesn't exist, the account is deactivated, or the password is
 * wrong — telling an attacker which one leaks which staff emails are real.
 */
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    const invalid = () => res.status(401).json({ error: 'invalid email or password' });

    if (user === null || !user.isActive) {
      invalid();
      return;
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      invalid();
      return;
    }

    const token = signStaffToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /auth/me — lets the frontend validate a stored token on load without re-sending credentials. */
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    // The account behind a still-valid token can vanish or be deactivated
    // between login and this request — treat that as "not authenticated"
    // rather than a server error.
    if (user === null || !user.isActive) {
      res.status(401).json({ error: 'invalid or expired token' });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});
