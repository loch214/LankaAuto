import { Router } from 'express';
import { z } from 'zod';
import { AvailabilityStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { buildPartWhere } from '../services/part-search.js';
import { hybridPartSearch } from '../services/hybrid-part-search.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';

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

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/**
 * GET /parts/search?q=&limit=
 *
 * Phase 3 (PLAN.md §10): the hybrid "single search box, part number or
 * description" — see `hybridPartSearch` for the exact-number → fuzzy-number
 * → semantic fallback. Deliberately separate from `GET /parts`, which stays
 * a plain filtered listing for the browse page's category/brand/vehicle
 * dropdowns; this route is for "I don't know which filters to click, I just
 * know what I'm holding or what I need."
 *
 * Declared before `/:id` — `/search` would otherwise fail the uuid check on
 * that route with a 400 rather than reaching this handler, which works but
 * is the wrong reason for it to work.
 */
partsRouter.get('/search', async (req, res, next) => {
  try {
    const { q, limit } = searchQuerySchema.parse(req.query);
    const hits = await hybridPartSearch(q, limit);
    res.json({ hits });
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

const updateAvailabilitySchema = z.object({
  status: z.enum(AvailabilityStatus),
});

/**
 * PATCH /parts/:id/availability — staff only.
 *
 * The "one-tap update" from PLAN.md §5: staff pick a status, nothing else.
 * Every change is also written to `verification_log` (old status, new
 * status, who, when) — the audit trail the freshness UI and overdue-category
 * nudges depend on, so it's written here rather than left as a follow-up.
 */
partsRouter.patch(
  '/:id/availability',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { status } = updateAvailabilitySchema.parse(req.body);

      const existing = await prisma.part.findUnique({ where: { id } });
      if (existing === null) {
        res.status(404).json({ error: 'part not found' });
        return;
      }

      const [part] = await prisma.$transaction([
        prisma.part.update({
          where: { id },
          data: {
            availabilityStatus: status,
            lastVerifiedAt: new Date(),
            verifiedSource: 'STAFF',
          },
        }),
        prisma.verificationLog.create({
          data: {
            partId: id,
            userId: req.user!.id,
            oldStatus: existing.availabilityStatus,
            newStatus: status,
          },
        }),
      ]);

      res.json(part);
    } catch (err) {
      next(err);
    }
  },
);
