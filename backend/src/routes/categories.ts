import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const categoriesRouter = Router();

/**
 * GET /categories
 *
 * Flat list, ordered by name. The schema supports a category tree
 * (`Category.parentId`/`children`), but nothing in the seeded data uses it
 * yet — the browse UI can render a flat filter list today and grow a nested
 * one when a real sub-category shows up, rather than building tree UI for
 * data that doesn't exist.
 */
categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});
