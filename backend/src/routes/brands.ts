import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';

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

const createBrandSchema = z.object({
  name: z.string().min(1).max(200),
  isOem: z.boolean().default(false),
  country: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

/** POST /brands — staff/admin. `normalizedName` mirrors ingestion's own uppercase/trim rule so a manually-created brand matches the same way a future import would. */
brandsRouter.post('/', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { name, isOem, country, notes } = createBrandSchema.parse(req.body);
    const normalizedName = name.trim().toUpperCase();

    const existing = await prisma.brand.findUnique({ where: { normalizedName } });
    if (existing !== null) {
      res.status(409).json({ error: 'a brand with that name already exists' });
      return;
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        normalizedName,
        isOem,
        ...(country !== undefined ? { country } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    res.status(201).json(brand);
  } catch (err) {
    next(err);
  }
});

const idParamSchema = z.object({ id: z.uuid() });
const updateBrandSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isOem: z.boolean().optional(),
  country: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** PATCH /brands/:id — staff/admin. */
brandsRouter.patch('/:id', requireAuth, requireRole('STAFF', 'ADMIN'), async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { name, isOem, country, notes } = updateBrandSchema.parse(req.body);

    const existing = await prisma.brand.findUnique({ where: { id } });
    if (existing === null) {
      res.status(404).json({ error: 'brand not found' });
      return;
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name, normalizedName: name.trim().toUpperCase() } : {}),
        ...(isOem !== undefined ? { isOem } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    res.json(brand);
  } catch (err) {
    next(err);
  }
});
