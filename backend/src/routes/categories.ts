import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';

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

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.uuid().optional(),
});

/** POST /categories — staff/admin. Slug is derived from name, not staff-supplied, so it can't drift from it. */
categoriesRouter.post('/', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { name, parentId } = createCategorySchema.parse(req.body);
    const slug = slugify(name);

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing !== null) {
      res.status(409).json({ error: 'a category with that name already exists' });
      return;
    }

    const category = await prisma.category.create({
      data: { name, slug, ...(parentId !== undefined ? { parentId } : {}) },
    });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

const idParamSchema = z.object({ id: z.uuid() });
const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.uuid().nullable().optional(),
});

/** PATCH /categories/:id — staff/admin. Renaming also updates the slug, matching `POST`'s derivation. */
categoriesRouter.patch('/:id', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { name, parentId } = updateCategorySchema.parse(req.body);

    const existing = await prisma.category.findUnique({ where: { id } });
    if (existing === null) {
      res.status(404).json({ error: 'category not found' });
      return;
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name, slug: slugify(name) } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
    });
    res.json(category);
  } catch (err) {
    next(err);
  }
});
