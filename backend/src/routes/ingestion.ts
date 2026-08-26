import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/require-auth.js';
import { parseSpreadsheet } from '../services/ingestion/parse-spreadsheet.js';
import { reembedPart } from '../services/ingestion/reembed-part.js';
import { normalizeName } from '../ingest/normalize-name.js';
import { normalizeCode } from '../ingest/normalize-code.js';
import { buildSourceKey } from '../ingest/build-source-key.js';

export const ingestionRouter = Router();

// Every ingestion route is staff/admin — day-to-day catalogue work, same
// tier as bulk-availability, not admin-only.
ingestionRouter.use(requireAuth, requireRole('STAFF', 'ADMIN'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * POST /ingestion/preview — parses the uploaded file and returns it in
 * full (not a sample). Nothing is persisted here; the frontend holds the
 * parsed rows in memory through the mapping step and sends them back
 * whole to `/import`, so the file is only uploaded once.
 */
ingestionRouter.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (req.file === undefined) {
      res.status(400).json({ error: 'no file uploaded (field name must be "file")' });
      return;
    }
    const parsed = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    res.json({ sourceFile: req.file.originalname, ...parsed });
  } catch (err) {
    next(err);
  }
});

const mappingSchema = z.object({
  // Each value is the column header from the sheet (as returned by
  // /preview) that feeds this field, or omitted if the sheet has no such
  // column.
  category: z.string().min(1),
  subCategory: z.string().optional(),
  brand: z.string().optional(),
  partNumber: z.string().optional(),
  rawName: z.string().min(1),
  recordNumber: z.string().optional(),
  fitmentText: z.string().optional(),
});

const importSchema = z.object({
  sourceFile: z.string().min(1),
  folderLabel: z.string().max(200).optional(),
  mapping: mappingSchema,
  rows: z.array(z.record(z.string(), z.string())).min(1).max(20000),
});

interface RowParsedAttributes {
  categoryName: string;
  categoryId: string | null;
  brandName: string | null;
  brandId: string | null;
  partNumber: string | null;
  recordNumber: string | null;
  fitmentText: string | null;
}

/**
 * POST /ingestion/import — creates one `IngestionRun` plus one
 * `StagingRow` per sheet row, using the staff-supplied column mapping.
 * Category/brand are matched against EXISTING rows only (by normalized
 * name) — an unmatched name is not silently created, it flags the row's
 * `error` so staff decide explicitly at review time (same "don't guess,
 * surface it" pattern as `fitment.ts`'s POSSIBLE tier). Nothing here
 * becomes a real `Part` yet — that's `/rows/:id/approve`.
 */
ingestionRouter.post('/import', async (req, res, next) => {
  try {
    const { sourceFile, folderLabel, mapping, rows } = importSchema.parse(req.body);

    const [categories, brands] = await Promise.all([
      prisma.category.findMany(),
      prisma.brand.findMany(),
    ]);
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
    const brandByNormalized = new Map(brands.map((b) => [b.normalizedName, b]));

    const run = await prisma.ingestionRun.create({
      data: { sourceFile, rowsTotal: rows.length, ...(folderLabel !== undefined ? { folderLabel } : {}) },
    });

    let flagged = 0;
    const stagingData = rows.map((row, index) => {
      const categoryNameRaw = row[mapping.category]?.trim() ?? '';
      const subCategoryNameRaw = mapping.subCategory !== undefined ? row[mapping.subCategory]?.trim() : undefined;
      const leafCategoryName = subCategoryNameRaw || categoryNameRaw;
      const resolvedCategory = leafCategoryName ? categoryBySlug.get(slugify(leafCategoryName)) : undefined;

      const brandNameRaw = mapping.brand !== undefined ? row[mapping.brand]?.trim() : undefined;
      const resolvedBrand = brandNameRaw ? brandByNormalized.get(brandNameRaw.toUpperCase()) : undefined;

      const partNumberRaw = mapping.partNumber !== undefined ? row[mapping.partNumber]?.trim() : undefined;
      const rawNameRaw = row[mapping.rawName]?.trim() ?? '';
      const recordNumberRaw = mapping.recordNumber !== undefined ? row[mapping.recordNumber]?.trim() : undefined;
      const fitmentTextRaw = mapping.fitmentText !== undefined ? row[mapping.fitmentText]?.trim() : undefined;

      const errors: string[] = [];
      if (!leafCategoryName) errors.push('missing category');
      else if (resolvedCategory === undefined) errors.push(`no matching category "${leafCategoryName}"`);
      if (brandNameRaw && resolvedBrand === undefined) errors.push(`no matching brand "${brandNameRaw}"`);
      if (!rawNameRaw) errors.push('missing description');

      const parsedAttributes: RowParsedAttributes = {
        categoryName: leafCategoryName,
        categoryId: resolvedCategory?.id ?? null,
        brandName: brandNameRaw ?? null,
        brandId: resolvedBrand?.id ?? null,
        partNumber: partNumberRaw ?? null,
        recordNumber: recordNumberRaw ?? null,
        fitmentText: fitmentTextRaw ?? null,
      };

      if (errors.length > 0) flagged += 1;

      return {
        runId: run.id,
        rowNumber: index + 1,
        raw: row,
        rawName: rawNameRaw || '(no description)',
        normalizedName: rawNameRaw ? normalizeName(rawNameRaw) : null,
        parsedAttributes: parsedAttributes as unknown as object,
        parseSource: 'MANUAL' as const,
        parseConfidence: errors.length === 0 ? 1 : 0,
        error: errors.length > 0 ? errors.join('; ') : null,
      };
    });

    await prisma.stagingRow.createMany({ data: stagingData });

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        rowsParsedByRule: rows.length - flagged,
        rowsFlagged: flagged,
      },
    });

    res.status(201).json({ runId: run.id, rowsTotal: rows.length, rowsFlagged: flagged });
  } catch (err) {
    next(err);
  }
});

/** GET /ingestion/runs — history, newest first. */
ingestionRouter.get('/runs', async (_req, res, next) => {
  try {
    const runs = await prisma.ingestionRun.findMany({ orderBy: { startedAt: 'desc' } });
    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

const runIdParamSchema = z.object({ id: z.uuid() });
// `z.coerce.boolean()` uses JS `Boolean(str)`, under which the string
// "false" is truthy — not what a `?pending=false` caller means. Comparing
// against the literal string instead avoids that trap.
const rowsQuerySchema = z.object({
  pending: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

/** GET /ingestion/runs/:id/rows?pending=true — that run's staging rows, pending-only by default. */
ingestionRouter.get('/runs/:id/rows', async (req, res, next) => {
  try {
    const { id } = runIdParamSchema.parse(req.params);
    const { pending } = rowsQuerySchema.parse(req.query);
    const rows = await prisma.stagingRow.findMany({
      where: { runId: id, ...(pending ? { processedAt: null } : {}) },
      orderBy: { rowNumber: 'asc' },
    });
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

const rowIdParamSchema = z.object({ id: z.uuid() });

const patchRowSchema = z.object({
  rawName: z.string().min(1).max(500).optional(),
  partNumber: z.string().max(100).nullable().optional(),
  recordNumber: z.string().max(100).nullable().optional(),
  categoryId: z.uuid().optional(),
  newCategoryName: z.string().min(1).max(200).optional(),
  brandId: z.uuid().nullable().optional(),
  newBrandName: z.string().min(1).max(200).optional(),
});

/**
 * PATCH /ingestion/rows/:id — staff corrects a flagged (or any pending) row
 * before approving: pick an existing category/brand, or supply
 * `newCategoryName`/`newBrandName` to create one (upserted by name/slug, so
 * this is safe to call more than once). Recomputes `error` from scratch
 * after applying the changes, so approving still checks a live state.
 */
ingestionRouter.patch('/rows/:id', async (req, res, next) => {
  try {
    const { id } = rowIdParamSchema.parse(req.params);
    const body = patchRowSchema.parse(req.body);

    const row = await prisma.stagingRow.findUnique({ where: { id } });
    if (row === null) {
      res.status(404).json({ error: 'row not found' });
      return;
    }
    if (row.processedAt !== null) {
      res.status(400).json({ error: 'this row was already approved or rejected' });
      return;
    }

    const current = (row.parsedAttributes ?? {}) as unknown as Partial<RowParsedAttributes>;

    let categoryId = body.categoryId ?? current.categoryId ?? null;
    let categoryName = current.categoryName ?? '';
    if (body.newCategoryName !== undefined) {
      const slug = slugify(body.newCategoryName);
      const category = await prisma.category.upsert({
        where: { slug },
        create: { name: body.newCategoryName, slug },
        update: {},
      });
      categoryId = category.id;
      categoryName = category.name;
    } else if (body.categoryId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (category === null) {
        res.status(400).json({ error: 'categoryId does not exist' });
        return;
      }
      categoryName = category.name;
    }

    let brandId = body.brandId !== undefined ? body.brandId : (current.brandId ?? null);
    let brandName = current.brandName ?? null;
    if (body.newBrandName !== undefined) {
      const normalizedName = body.newBrandName.trim().toUpperCase();
      const brand = await prisma.brand.upsert({
        where: { normalizedName },
        create: { name: body.newBrandName, normalizedName },
        update: {},
      });
      brandId = brand.id;
      brandName = brand.name;
    } else if (body.brandId !== undefined && body.brandId !== null) {
      const brand = await prisma.brand.findUnique({ where: { id: body.brandId } });
      if (brand === null) {
        res.status(400).json({ error: 'brandId does not exist' });
        return;
      }
      brandName = brand.name;
    } else if (body.brandId === null) {
      brandName = null;
    }

    const rawName = body.rawName ?? row.rawName;
    const partNumber = body.partNumber !== undefined ? body.partNumber : (current.partNumber ?? null);
    const recordNumber = body.recordNumber !== undefined ? body.recordNumber : (current.recordNumber ?? null);

    const errors: string[] = [];
    if (categoryId === null) errors.push(`no matching category "${categoryName || '(none)'}"`);
    if (!rawName) errors.push('missing description');

    const parsedAttributes: RowParsedAttributes = {
      categoryName,
      categoryId,
      brandName,
      brandId,
      partNumber,
      recordNumber,
      fitmentText: current.fitmentText ?? null,
    };

    const updated = await prisma.stagingRow.update({
      where: { id },
      data: {
        rawName,
        normalizedName: normalizeName(rawName),
        parsedAttributes: parsedAttributes as unknown as object,
        parseConfidence: errors.length === 0 ? 1 : 0,
        error: errors.length > 0 ? errors.join('; ') : null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * Turns one clean `StagingRow` into a real `Part`, upserting on the same
 * `sourceKey` shape every other ingestion path uses. Rows with no part
 * number fall back to a normalized-name key so a re-import of the same row
 * updates rather than duplicates it. Embeds the part immediately
 * afterward — embedding failure does not undo the part creation, it's
 * reported back separately so staff aren't blocked by a transient API
 * problem (e.g. the Gemini daily quota).
 */
async function approveStagingRow(rowId: string): Promise<
  | { ok: true; partId: string; embedded: boolean; embedError?: string }
  | { ok: false; error: string }
> {
  const row = await prisma.stagingRow.findUnique({ where: { id: rowId }, include: { run: true } });
  if (row === null) return { ok: false, error: 'row not found' };
  if (row.processedAt !== null) return { ok: false, error: 'this row was already approved or rejected' };
  if (row.error !== null) return { ok: false, error: `resolve the flagged issue first: ${row.error}` };

  const attrs = (row.parsedAttributes ?? {}) as unknown as RowParsedAttributes;
  if (attrs.categoryId === null || attrs.categoryId === undefined) {
    return { ok: false, error: 'row has no resolved category' };
  }

  const partNumber = attrs.partNumber ?? null;
  const sourceKey =
    partNumber !== null
      ? buildSourceKey(attrs.brandName, partNumber)
      : buildSourceKey(attrs.brandName, normalizeName(row.rawName));

  const part = await prisma.part.upsert({
    where: { sourceKey },
    create: {
      categoryId: attrs.categoryId,
      brandId: attrs.brandId ?? null,
      rawName: row.rawName,
      normalizedName: row.normalizedName ?? normalizeName(row.rawName),
      partNumber: partNumber !== null ? normalizeCode(partNumber) : null,
      attributes: attrs.fitmentText !== null ? { fitmentText: attrs.fitmentText } : {},
      parseConfidence: 1,
      parseSource: 'MANUAL',
      needsReview: false,
      sourceKey,
      folderLabel: row.run.folderLabel,
      recordNumber: attrs.recordNumber ?? null,
    },
    update: {
      categoryId: attrs.categoryId,
      brandId: attrs.brandId ?? null,
      rawName: row.rawName,
      normalizedName: row.normalizedName ?? normalizeName(row.rawName),
      partNumber: partNumber !== null ? normalizeCode(partNumber) : null,
      folderLabel: row.run.folderLabel,
      recordNumber: attrs.recordNumber ?? null,
    },
  });

  await prisma.stagingRow.update({
    where: { id: rowId },
    data: { partId: part.id, processedAt: new Date() },
  });

  try {
    await reembedPart(part.id);
    return { ok: true, partId: part.id, embedded: true };
  } catch (err) {
    return { ok: true, partId: part.id, embedded: false, embedError: err instanceof Error ? err.message : String(err) };
  }
}

ingestionRouter.post('/rows/:id/approve', async (req, res, next) => {
  try {
    const { id } = rowIdParamSchema.parse(req.params);
    const result = await approveStagingRow(id);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const rejectRowSchema = z.object({ reason: z.string().max(500).optional() });

/** POST /ingestion/rows/:id/reject — skips a row, no `Part` produced. */
ingestionRouter.post('/rows/:id/reject', async (req, res, next) => {
  try {
    const { id } = rowIdParamSchema.parse(req.params);
    const { reason } = rejectRowSchema.parse(req.body);

    const row = await prisma.stagingRow.findUnique({ where: { id } });
    if (row === null) {
      res.status(404).json({ error: 'row not found' });
      return;
    }
    if (row.processedAt !== null) {
      res.status(400).json({ error: 'this row was already approved or rejected' });
      return;
    }

    const updated = await prisma.stagingRow.update({
      where: { id },
      data: { processedAt: new Date(), error: reason ?? row.error ?? 'rejected by staff' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /ingestion/runs/:id/approve-clean — bulk-approves every pending row
 * in the run that has no `error`, so staff aren't clicking through hundreds
 * of obviously-fine rows one at a time. Flagged rows are left untouched —
 * they still need `PATCH`/`reject` individually.
 */
ingestionRouter.post('/runs/:id/approve-clean', async (req, res, next) => {
  try {
    const { id } = runIdParamSchema.parse(req.params);
    const cleanRows = await prisma.stagingRow.findMany({
      where: { runId: id, processedAt: null, error: null },
      select: { id: true },
    });

    let approved = 0;
    let embedFailed = 0;
    for (const row of cleanRows) {
      const result = await approveStagingRow(row.id);
      if (result.ok) {
        approved += 1;
        if (!result.embedded) embedFailed += 1;
      }
    }

    res.json({ attempted: cleanRows.length, approved, embedFailed });
  } catch (err) {
    next(err);
  }
});
