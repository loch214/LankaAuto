import { Router } from 'express';
import { z } from 'zod';
import { AvailabilityStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { buildPartWhere } from '../services/part-search.js';
import { hybridPartSearch } from '../services/hybrid-part-search.js';
import { checkFitment } from '../services/fitment.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';
import { reembedPart } from '../services/ingestion/reembed-part.js';

export const partsRouter = Router();

/**
 * Every `Part` scalar EXCEPT `folderLabel`/`recordNumber` — the structural
 * guarantee that the customer-facing routes below (`GET /parts`, `GET
 * /parts/:id`) cannot leak the staff-only physical price-list citation, the
 * same way `services/agent/tools.ts` structurally withholds availability
 * from the customer chat agent. An explicit allow-list here also means a
 * future sensitive column added to `Part` is excluded by default, not
 * included by default the way Prisma's no-`select` behavior would.
 */
const CUSTOMER_SAFE_PART_SELECT = {
  id: true,
  categoryId: true,
  brandId: true,
  rawName: true,
  normalizedName: true,
  partNumber: true,
  attributes: true,
  availabilityStatus: true,
  lastVerifiedAt: true,
  verifiedSource: true,
  location: true,
  parseConfidence: true,
  parseSource: true,
  needsReview: true,
  sourceKey: true,
  createdAt: true,
  updatedAt: true,
  brand: true,
  category: true,
} as const;

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
        select: CUSTOMER_SAFE_PART_SELECT,
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
 *
 * Staff/admin only — not because the search itself is sensitive (`GET
 * /parts` is wide open), but because results here carry `folderLabel`/
 * `recordNumber`, the staff-only physical price-list citation. Locking this
 * route down is the structural guarantee that data never reaches a
 * customer, the same pattern used to hide availability from the customer
 * chat agent (`services/agent/tools.ts`).
 */
partsRouter.get(
  '/search',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { q, limit } = searchQuerySchema.parse(req.query);
      const hits = await hybridPartSearch(q, limit);
      res.json({ hits });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * A single bulk update is capped so one mistyped/broad filter can't rewrite
 * the entire catalogue's availability in one request. 5,000 comfortably
 * covers "an entire category" at this catalogue's real scale while still
 * being a deliberate ceiling, not an accident of whatever Postgres/Node can
 * push through in one transaction.
 */
export const BULK_UPDATE_LIMIT = 5000;

const bulkAvailabilitySchema = z.object({
  q: z.string().max(200).optional(),
  categorySlug: z.string().max(200).optional(),
  brandId: z.uuid().optional(),
  vehicleMake: z.string().max(200).optional(),
  vehicleModel: z.string().max(200).optional(),
  status: z.enum(AvailabilityStatus),
  dryRun: z.boolean().default(false),
});

/**
 * POST /parts/bulk-availability — staff only.
 *
 * The category-wise counterpart to the one-tap PATCH above: per-part tapping
 * doesn't scale to a catalogue of thousands, so staff filter (same shape as
 * `GET /parts`) and apply one status to everything that matches. Reuses
 * `buildPartWhere` rather than a second filter builder.
 *
 * A plain `updateMany` can't produce a correct audit trail — each matched
 * part has its own `oldStatus` — so this does findMany → createMany (one log
 * row per part) → updateMany, all inside one transaction. Parts already at
 * the target status are excluded up front so they don't generate no-op log
 * rows.
 *
 * `dryRun: true` returns counts only, with no writes — this is what powers
 * the frontend's "this will change 1,247 parts" confirmation step. Declared
 * above `/:id`, same reason `/search` is: a literal path segment must not
 * fall through to the `:id` uuid check.
 */
partsRouter.post(
  '/bulk-availability',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { q, categorySlug, brandId, vehicleMake, vehicleModel, status, dryRun } =
        bulkAvailabilitySchema.parse(req.body);

      const where = {
        ...buildPartWhere({ q, categorySlug, brandId, vehicleMake, vehicleModel }),
      };
      // Fold "not already at the target status" into the same AND the filter
      // builder already produces, rather than a second top-level clause.
      const AND = Array.isArray(where.AND) ? where.AND : where.AND !== undefined ? [where.AND] : [];
      const scopedWhere = { AND: [...AND, { availabilityStatus: { not: status } }] };

      const matched = await prisma.part.count({ where: scopedWhere });

      if (matched === 0) {
        res.status(400).json({ error: 'no parts match this filter (or all already have that status)' });
        return;
      }
      if (matched > BULK_UPDATE_LIMIT) {
        res.status(400).json({
          error: `this filter matches ${matched} parts, over the ${BULK_UPDATE_LIMIT}-part limit for one bulk update — narrow the filter`,
        });
        return;
      }

      if (dryRun) {
        res.json({ matched, willChange: matched });
        return;
      }

      const targets = await prisma.part.findMany({
        where: scopedWhere,
        select: { id: true, availabilityStatus: true },
      });

      await prisma.$transaction([
        prisma.verificationLog.createMany({
          data: targets.map((part) => ({
            partId: part.id,
            userId: req.user!.id,
            oldStatus: part.availabilityStatus,
            newStatus: status,
          })),
        }),
        prisma.part.updateMany({
          where: { id: { in: targets.map((part) => part.id) } },
          data: { availabilityStatus: status, lastVerifiedAt: new Date(), verifiedSource: 'STAFF' },
        }),
      ]);

      res.json({ matched, updated: targets.length });
    } catch (err) {
      next(err);
    }
  },
);

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
      select: { ...CUSTOMER_SAFE_PART_SELECT, fitments: { include: { vehicle: true } } },
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

const fitmentCheckQuerySchema = z.object({
  vehicleId: z.uuid(),
});

/**
 * GET /parts/:id/fitment-check?vehicleId=
 *
 * Phase 4 (PLAN.md §10) — the part → vehicle direction: "does this part fit
 * my car?" See `checkFitment` for the three-tier CONFIRMED/POSSIBLE/
 * NO_MATCH answer; this route just resolves ids to a 404 before handing off,
 * same shape as `GET /parts/:id`.
 */
partsRouter.get('/:id/fitment-check', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { vehicleId } = fitmentCheckQuerySchema.parse(req.query);

    const [part, vehicle] = await Promise.all([
      prisma.part.findUnique({ where: { id } }),
      prisma.vehicle.findUnique({ where: { id: vehicleId } }),
    ]);
    if (part === null) {
      res.status(404).json({ error: 'part not found' });
      return;
    }
    if (vehicle === null) {
      res.status(404).json({ error: 'vehicle not found' });
      return;
    }

    const result = await checkFitment(id, vehicleId);
    res.json(result);
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

const editPartSchema = z.object({
  rawName: z.string().min(1).max(500).optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().nullable().optional(),
  partNumber: z.string().min(1).max(100).nullable().optional(),
  folderLabel: z.string().max(200).nullable().optional(),
  recordNumber: z.string().max(100).nullable().optional(),
});

/**
 * PATCH /parts/:id — staff-only catalogue editing (as opposed to the
 * customer-invisible `folderLabel`/`recordNumber` fields, and separate from
 * the one-tap availability PATCH above). Re-embeds immediately if any field
 * that feeds `buildEmbeddingText` changed, so search doesn't go stale
 * between edits and the next `npm run embed:parts`.
 */
partsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = editPartSchema.parse(req.body);

      const existing = await prisma.part.findUnique({ where: { id } });
      if (existing === null) {
        res.status(404).json({ error: 'part not found' });
        return;
      }

      // Built imperatively rather than via conditional spreads — several
      // spreads merged into one object literal defeat Prisma's input-type
      // inference here and collapse `categoryId` to `never`.
      const data: Prisma.PartUpdateInput = {};
      if (body.rawName !== undefined) {
        data.rawName = body.rawName;
        data.normalizedName = body.rawName.trim().replace(/\s+/g, ' ').toUpperCase();
      }
      if (body.categoryId !== undefined) {
        data.category = { connect: { id: body.categoryId } };
      }
      if (body.brandId !== undefined) {
        data.brand = body.brandId === null ? { disconnect: true } : { connect: { id: body.brandId } };
      }
      if (body.partNumber !== undefined) data.partNumber = body.partNumber;
      if (body.folderLabel !== undefined) data.folderLabel = body.folderLabel;
      if (body.recordNumber !== undefined) data.recordNumber = body.recordNumber;

      const part = await prisma.part.update({ where: { id }, data });

      const searchableFieldsChanged =
        body.rawName !== undefined ||
        body.categoryId !== undefined ||
        body.brandId !== undefined ||
        body.partNumber !== undefined;
      if (searchableFieldsChanged) {
        await reembedPart(id);
      }

      res.json(part);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /parts/:id — staff-only hard delete. Dependent rows follow the
 * schema's existing `onDelete` rules (e.g. `StagingRow.partId` →
 * `SetNull`, `VerificationLog.partId` → whatever the schema already
 * declares) — nothing extra to orchestrate here.
 */
partsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const existing = await prisma.part.findUnique({ where: { id } });
      if (existing === null) {
        res.status(404).json({ error: 'part not found' });
        return;
      }
      await prisma.part.delete({ where: { id } });
      res.json({ id });
    } catch (err) {
      next(err);
    }
  },
);
