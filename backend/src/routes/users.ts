import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';

export const usersRouter = Router();

// Every route here is ADMIN-only — staff account management is not
// something a staff account can do to itself or to each other.
usersRouter.use(requireAuth, requireRole('ADMIN'));

/** Never send `passwordHash` back, on any route in this file. */
const SAFE_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: SAFE_SELECT,
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  username: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  password: z.string().min(8),
  role: z.enum(UserRole).default('STAFF'),
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const { username, name, password, role } = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing !== null) {
      res.status(409).json({ error: 'that username is already taken' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, name, passwordHash, role },
      select: SAFE_SELECT,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

const idParamSchema = z.object({ id: z.uuid() });

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /users/:id — rename, reset password, change role, or
 * deactivate/reactivate, any subset in one request.
 *
 * Two lockout guards, both real risks and both worth a clear 400 rather than
 * "shop is now unable to log in as anyone": an admin can't deactivate or
 * demote themselves (a stray click on your own row disables the only account
 * that could undo it — see the delete route for the parallel self-delete
 * guard), and the last active admin can't be demoted or deactivated by
 * anyone, self or otherwise — there is no signup page to recover through.
 */
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { name, password, role, isActive } = updateUserSchema.parse(req.body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (target === null) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    const losingAdmin =
      target.role === 'ADMIN' &&
      ((role !== undefined && role !== 'ADMIN') || isActive === false);

    if (losingAdmin && req.user!.id === id) {
      res.status(400).json({ error: 'you cannot demote or deactivate your own account' });
      return;
    }

    if (losingAdmin) {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        res.status(400).json({ error: 'cannot demote or deactivate the last active admin' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: SAFE_SELECT,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    if (req.user!.id === id) {
      res.status(400).json({ error: 'you cannot delete your own account' });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (target === null) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    if (target.role === 'ADMIN') {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        res.status(400).json({ error: 'cannot delete the last active admin' });
        return;
      }
    }

    // The audit trail survives this on purpose — VerificationLog.userId is
    // onDelete: SetNull, so past stock changes stay in the log with no name
    // rather than vanishing with the account.
    await prisma.user.delete({ where: { id } });
    res.json({ id });
  } catch (err) {
    next(err);
  }
});
