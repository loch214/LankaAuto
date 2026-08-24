import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const brandsRouter = Router();

/** GET /brands — flat list, ordered by name, for the browse-filter sidebar. */
brandsRouter.get('/', async (_req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ brands });
  } catch (err) {
    next(err);
  }
});
