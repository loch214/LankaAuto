import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { buildPartWhere } from '../services/part-search.js';

export const partsRouter = Router();

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  categorySlug: z.string().max(200).optional(),
  brandId: z.uuid().optional(),
  vehicleMake: z.string().max(200).optional(),
  vehicleModel: z.string().max(200).optional(),
  // Page size is capped, not just defaulted — an unbounded `limit` from a
  // query string is a cheap way to make one request do the work of a
  // thousand.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /parts?q=&categorySlug=&brandId=&vehicleMake=&vehicleModel=&limit=&offset=
 *
 * Free-text search plus the browse-page filters from PLAN.md §8 (category,
 * brand, vehicle make/model) — see `buildPartWhere` for how they combine.
 * Deliberately NOT semantic search; embeddings are Phase 3 (PLAN.md §10),
 * and reaching for pgvector here would be solving a problem this endpoint
 * doesn't have yet.
 */
partsRouter.get('/', async (req, res, next) => {
  try {
    const { q, categorySlug, brandId, vehicleMake, vehicleModel, limit, offset } =
      listQuerySchema.parse(req.query);
    const where = buildPartWhere({ q, categorySlug, brandId, vehicleMake, vehicleModel });

    const [parts, total] = await Promise.all([
      prisma.part.findMany({
        where,
        take: limit,
        skip: offset,
        // `id` as a tiebreaker is load-bearing, not decoration: 5 distinct
        // normalizedName values repeat in the seeded GMB data (e.g. 4 rows
        // all "KOMATSU D30"). `orderBy: normalizedName` alone gives Postgres
        // no fixed order among ties, so two paginated requests can order
        // them differently and a row gets skipped or duplicated across pages.
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        include: { brand: true, category: true },
      }),
      prisma.part.count({ where }),
    ]);

    res.json({ parts, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

const idParamSchema = z.object({
  // Part IDs are Postgres uuids (schema.prisma: `@id @default(uuid())`).
  // Validating the shape here means a malformed id fails with a clean 400,
  // not a Prisma runtime error surfaced as a 500.
  id: z.uuid(),
});

/**
 * GET /parts/:id
 *
 * Full detail for one part: its parsed `attributes` JSON and every asserted
 * fitment, each resolved to the vehicle it points at. This is the shape the
 * handoff asked for explicitly — "including its attributes JSON and any
 * linked PartFitment → Vehicle rows".
 */
partsRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const part = await prisma.part.findUnique({
      where: { id },
      include: {
        brand: true,
        category: true,
        fitments: { include: { vehicle: true } },
      },
    });

    if (part === null) {
      res.status(404).json({ error: 'part not found' });
      return;
    }

    res.json(part);
  } catch (err) {
    next(err);
  }
});
