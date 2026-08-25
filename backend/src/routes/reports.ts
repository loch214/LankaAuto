import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';

export const reportsRouter = Router();

// Admin-only, same as users.ts — reports exist because the admin can't
// stand at the counter and eyeball thousands of parts the way staff can.
reportsRouter.use(requireAuth, requireRole('ADMIN'));

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /reports/stock-summary
 *
 * How many parts are in each availability status, overall and per category —
 * the "how healthy does the catalogue look" view.
 */
reportsRouter.get('/stock-summary', async (_req, res, next) => {
  try {
    const [overallGroups, byCategoryGroups, categories] = await Promise.all([
      prisma.part.groupBy({ by: ['availabilityStatus'], _count: { _all: true } }),
      prisma.part.groupBy({ by: ['categoryId', 'availabilityStatus'], _count: { _all: true } }),
      prisma.category.findMany({ select: { id: true, name: true } }),
    ]);

    const categoryNames = new Map(categories.map((c) => [c.id, c.name] as const));

    const overall = Object.fromEntries(overallGroups.map((g) => [g.availabilityStatus, g._count._all]));

    const byCategoryMap = new Map<string, { categoryId: string; categoryName: string; counts: Record<string, number> }>();
    for (const g of byCategoryGroups) {
      const entry = byCategoryMap.get(g.categoryId) ?? {
        categoryId: g.categoryId,
        categoryName: categoryNames.get(g.categoryId) ?? 'Unknown category',
        counts: {},
      };
      entry.counts[g.availabilityStatus] = g._count._all;
      byCategoryMap.set(g.categoryId, entry);
    }

    res.json({ overall, byCategory: [...byCategoryMap.values()] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /reports/stale-parts?limit=&offset=
 *
 * Parts nobody has verified recently — "never" (`last_verified_at IS NULL`)
 * or longer ago than their own category's `verification_interval_days`
 * (`Category.verificationIntervalDays`, in the schema since Milestone 1A but
 * unused by any code until now — see PLAN.md §5's rotating-verification
 * design). Per-category thresholds mean this can't be a single Prisma
 * `where` comparison against one cutoff date, so it's a raw query joining
 * parts to their category's own interval.
 */
reportsRouter.get('/stale-parts', async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<
        {
          id: string;
          rawName: string;
          partNumber: string | null;
          availabilityStatus: string;
          lastVerifiedAt: Date | null;
          categoryName: string;
        }[]
      >`
        SELECT p.id, p.raw_name AS "rawName", p.part_number AS "partNumber",
               p.availability_status AS "availabilityStatus",
               p.last_verified_at AS "lastVerifiedAt", c.name AS "categoryName"
        FROM parts p
        JOIN categories c ON c.id = p.category_id
        WHERE p.last_verified_at IS NULL
           OR p.last_verified_at < now() - (c.verification_interval_days || ' days')::interval
        ORDER BY p.last_verified_at ASC NULLS FIRST
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count
        FROM parts p
        JOIN categories c ON c.id = p.category_id
        WHERE p.last_verified_at IS NULL
           OR p.last_verified_at < now() - (c.verification_interval_days || ' days')::interval
      `,
    ]);

    res.json({ parts: rows, total: Number(totalRows[0]?.count ?? 0n), limit, offset });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /reports/activity?limit=&offset=
 *
 * Recent verification_log entries — who changed what stock status and when,
 * newest first. A row whose user was later deleted still shows (`userId` is
 * onDelete: SetNull specifically so the audit trail survives account
 * deletion) — it just has no name attached.
 */
reportsRouter.get('/activity', async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);

    const [entries, total] = await Promise.all([
      prisma.verificationLog.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          part: { select: { rawName: true, partNumber: true } },
          user: { select: { name: true, username: true } },
        },
      }),
      prisma.verificationLog.count(),
    ]);

    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        oldStatus: e.oldStatus,
        newStatus: e.newStatus,
        partId: e.partId,
        partNumber: e.part.partNumber,
        rawName: e.part.rawName,
        userName: e.user?.name ?? null,
        username: e.user?.username ?? null,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /reports/out-of-stock?limit=&offset= — a straight, paginated reorder list. */
reportsRouter.get('/out-of-stock', async (req, res, next) => {
  try {
    const { limit, offset } = paginationSchema.parse(req.query);

    const [parts, total] = await Promise.all([
      prisma.part.findMany({
        where: { availabilityStatus: 'OUT_OF_STOCK' },
        take: limit,
        skip: offset,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        include: { category: { select: { name: true } }, brand: { select: { name: true } } },
      }),
      prisma.part.count({ where: { availabilityStatus: 'OUT_OF_STOCK' } }),
    ]);

    res.json({ parts, total, limit, offset });
  } catch (err) {
    next(err);
  }
});
