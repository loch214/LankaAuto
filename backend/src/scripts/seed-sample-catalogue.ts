/**
 * Seeds the sample catalogue (`src/seed/sample-parts.ts` +
 * `src/seed/sample-vehicles.ts`) so the eight empty categories stop being
 * dead ends. Read `sample-parts.ts`'s header first — it documents how far
 * this data can be trusted, which matters more than how it is loaded.
 *
 *   npm run seed:sample            load / re-load (idempotent)
 *   npm run seed:sample -- --purge remove every trace of it
 *
 * ## Idempotency
 *
 * Same guarantee as `ingest-gmb-ujoint.ts`, and for the same reason — a
 * seed you cannot re-run without duplicating rows is a seed you stop
 * running. Everything upserts on a natural key:
 *
 *   - `Category` by `slug` (must already exist — see below)
 *   - `Brand`    by `name`
 *   - `Vehicle`  by `identityKey`
 *   - `Part`     by `sourceKey` (`buildSourceKey(brand, code)`)
 *   - `PartFitment` by `[partId, vehicleId]`
 *   - `StagingRow`  by `[runId, rowNumber]`
 *
 * The `IngestionRun` is the one thing `ingest-gmb-ujoint.ts` deliberately
 * does NOT upsert (each run is its own audit record). Here it is
 * find-or-create by `sourceFile`, because this run is not an audit record of
 * a real ingestion — it is a provenance marker saying "these rows are demo
 * data," and there should be exactly one of it however many times the seed
 * is run.
 *
 * ## What this script does NOT invent
 *
 * `folderLabel`, `recordNumber` and `location` are all left null. They are
 * physical pointers — a price-list folder, a record line, a shelf — and a
 * pointer to a place where the part isn't is worse than no pointer. Same
 * reasoning as `sample-parts.ts`'s header.
 *
 * No `VerificationLog` rows are written either. That report answers "who
 * changed what stock status and when", and there is no honest answer for
 * seeded data; it stays empty until staff actually use the app.
 */
import type { AvailabilityStatus, VerificationSource } from '@prisma/client';
import { prisma, disconnect } from '../lib/prisma.js';
import { normalizeCode } from '../ingest/normalize-code.js';
import { normalizeName } from '../ingest/normalize-name.js';
import { buildSourceKey } from '../ingest/build-source-key.js';
import { SAMPLE_PARTS, SAMPLE_BRANDS, type SamplePart } from '../seed/sample-parts.js';
import {
  SAMPLE_VEHICLES,
  VEHICLES_BY_KEY,
  vehicleIdentityKey,
  type SampleVehicle,
} from '../seed/sample-vehicles.js';

/**
 * The provenance marker. `--purge` finds the sample data by this prefix, and
 * so can anyone asking "is this row real?" — hence a prefix match rather
 * than an exact string, so the label can be reworded without orphaning the
 * data it identifies.
 */
const SOURCE_FILE_PREFIX = 'SAMPLE CATALOGUE';
const SOURCE_FILE = `${SOURCE_FILE_PREFIX} (src/seed/sample-parts.ts) — hand-entered demo rows, NOT a verified price list`;

/**
 * Every sample fitment is INGESTED at the schema's default 0.5 confidence,
 * never STAFF. `checkFitment` renders the two differently ("confirmed by
 * staff" vs "ingested from the price list"), so this is what stops the
 * agent's CONFIRMED verdict from claiming a human checked a fitment that
 * nobody has.
 */
const FITMENT_NOTE = 'Sample catalogue data — not yet checked against the shop price lists.';

// ---------------------------------------------------------------------------
// Availability — synthetic, and the one part of this data that is meant to be
// ---------------------------------------------------------------------------

/**
 * Availability is genuinely per-shop, per-day state; there is nothing to be
 * faithful to. What it does need to be is *spread*, so every UI state has
 * rows to render: the browse page's status chip, the reports page's
 * per-category breakdown, and the stale-parts report (which compares
 * `lastVerifiedAt` against each category's own `verificationIntervalDays`,
 * default 30).
 *
 * A fixed 10-slot cycle rather than `Math.random()` — 50% IN_STOCK, 20% LOW,
 * 10% OUT_OF_STOCK, 20% UNVERIFIED. Deterministic means re-running the seed
 * does not silently reshuffle every part's status, so a screenshot or a test
 * written against it stays valid.
 */
const AVAILABILITY_CYCLE: readonly AvailabilityStatus[] = [
  'IN_STOCK', 'IN_STOCK', 'LOW', 'IN_STOCK', 'OUT_OF_STOCK',
  'IN_STOCK', 'UNVERIFIED', 'IN_STOCK', 'LOW', 'UNVERIFIED',
];

interface AvailabilityFields {
  readonly availabilityStatus: AvailabilityStatus;
  readonly lastVerifiedAt: Date | null;
  readonly verifiedSource: VerificationSource | null;
}

function availabilityFor(index: number): AvailabilityFields {
  const status = AVAILABILITY_CYCLE[index % AVAILABILITY_CYCLE.length] ?? 'UNVERIFIED';

  // UNVERIFIED means literally nobody has established it — so no date and no
  // source, not a date with a shrug attached.
  if (status === 'UNVERIFIED') {
    return { availabilityStatus: status, lastVerifiedAt: null, verifiedSource: null };
  }

  // 13 is coprime with 118, so this walks the whole 2..119-day range instead
  // of landing on a handful of values. Crossing the 30-day default interval
  // is the point: it leaves both fresh and stale rows for the report.
  const daysAgo = ((index * 13) % 118) + 2;
  const lastVerifiedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  // Recent = a human looked at the shelf; older = it came off a list. This
  // is the distinction `VerificationSource`'s schema comment draws, and the
  // freshness UI leans on it.
  return {
    availabilityStatus: status,
    lastVerifiedAt,
    verifiedSource: daysAgo <= 21 ? 'STAFF' : 'PRICE_LIST',
  };
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

function uniq(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))];
}

/**
 * Derives `Part.attributes` from the row plus the vehicles it declares it
 * fits, rather than having the data file hand-write both. Hand-writing them
 * separately is how `attributes.model` ends up disagreeing with
 * `part_fitments` — a drift with no error attached, which then shows up as
 * `checkFitment` returning NO_MATCH for a part that has an asserted fitment
 * row two tables over.
 *
 * Keys match what `parseEmbeddingAttributes` reads (make, model,
 * chassisCode, engine, body, inlineMake, fuel), so the embedding recipe and
 * `checkFitment`'s POSSIBLE tier both see this data without either being
 * changed.
 *
 * `make` (single) holds the row's primary make; `inlineMake` (list) holds
 * every make among the fitted vehicles. `checkFitment` unions the two, so a
 * genuinely multi-make part — an NGK plug suiting a Toyota, a Nissan, a
 * Mitsubishi and a Mazda — matches all of them instead of only the first.
 *
 * `position` is an extra key beyond the seven the parser produces. It
 * renders on the part detail page (which lists whatever keys it finds) but
 * is invisible to the embedding, which is fine: FRONT/REAR/RH/LH is always
 * in `rawName` too, and that is the sentence being embedded.
 */
function buildAttributes(row: SamplePart, vehicles: readonly SampleVehicle[]) {
  return {
    make: row.make,
    model: uniq(vehicles.map((v) => v.model)),
    chassisCode: uniq(vehicles.map((v) => v.chassisCode)),
    engine: uniq([...(row.engine ?? []), ...vehicles.map((v) => v.engineType)]),
    body: uniq(vehicles.map((v) => v.body)),
    inlineMake: uniq(vehicles.map((v) => v.make)),
    fuel: uniq(vehicles.map((v) => v.fuel)),
    ...(row.position !== undefined ? { position: row.position } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validation — cheap checks that turn silent data loss into a loud failure
// ---------------------------------------------------------------------------

/**
 * Three ways 116 hand-written rows go wrong quietly, all checked before a
 * single write:
 *
 * 1. **A duplicate `(brand, code)` pair.** Both rows would upsert onto the
 *    same `sourceKey` and the second would overwrite the first — 93 rows in,
 *    92 rows out, no error.
 * 2. **A `fits` key with no vehicle.** A typo'd `'corolla-ae111'` would just
 *    silently produce a part with no fitments.
 * 3. **A brand not declared in `SAMPLE_BRANDS`.** It would never be created,
 *    and the part lookup would fail mid-run leaving a half-seeded database.
 */
function validate(): void {
  const problems: string[] = [];

  const seenKeys = new Map<string, string>();
  for (const row of SAMPLE_PARTS) {
    const key = buildSourceKey(row.brand, row.code);
    const previous = seenKeys.get(key);
    if (previous !== undefined) {
      problems.push(`duplicate source key ${key}: "${previous}" and "${row.name}"`);
    }
    seenKeys.set(key, row.name);

    for (const vehicleKey of row.fits ?? []) {
      if (!VEHICLES_BY_KEY.has(vehicleKey)) {
        problems.push(`"${row.name}" (${row.code}) fits unknown vehicle key "${vehicleKey}"`);
      }
    }
  }

  const declaredBrands = new Set(SAMPLE_BRANDS.map((b) => b.name));
  for (const row of SAMPLE_PARTS) {
    if (!declaredBrands.has(row.brand)) {
      problems.push(`"${row.name}" uses brand "${row.brand}", which is not in SAMPLE_BRANDS`);
    }
  }

  const vehicleKeys = new Set<string>();
  for (const v of SAMPLE_VEHICLES) {
    if (vehicleKeys.has(v.key)) problems.push(`duplicate vehicle key "${v.key}"`);
    vehicleKeys.add(v.key);
  }

  if (problems.length > 0) {
    throw new Error(`sample catalogue data is invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  validate();

  // Categories are NOT created here. `seed-categories.ts` owns that list, and
  // having two scripts able to create the same category by slug is how the
  // two lists drift. Fail with the fix in the message instead.
  const slugs = [...new Set(SAMPLE_PARTS.map((p) => p.category))];
  const categories = await prisma.category.findMany({ where: { slug: { in: slugs } } });
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]));
  const missing = slugs.filter((s) => !categoryIds.has(s));
  if (missing.length > 0) {
    throw new Error(`missing categories: ${missing.join(', ')}. Run \`npm run seed:categories\` first.`);
  }

  const brandIds = new Map<string, string>();
  for (const brand of SAMPLE_BRANDS) {
    const row = await prisma.brand.upsert({
      where: { name: brand.name },
      create: {
        name: brand.name,
        normalizedName: normalizeName(brand.name),
        isOem: brand.isOem,
        country: brand.country,
      },
      update: { isOem: brand.isOem, country: brand.country },
    });
    brandIds.set(brand.name, row.id);
  }
  console.log(`brands:   ${brandIds.size} upserted`);

  const vehicleIds = new Map<string, string>();
  for (const vehicle of SAMPLE_VEHICLES) {
    const data = {
      make: vehicle.make,
      model: vehicle.model,
      chassisCode: vehicle.chassisCode,
      yearFrom: vehicle.yearFrom,
      yearTo: vehicle.yearTo,
      engineType: vehicle.engineType,
      attributes: { fuel: vehicle.fuel, body: vehicle.body },
    };
    const row = await prisma.vehicle.upsert({
      where: { identityKey: vehicleIdentityKey(vehicle) },
      create: { ...data, identityKey: vehicleIdentityKey(vehicle) },
      update: data,
    });
    vehicleIds.set(vehicle.key, row.id);
  }
  console.log(`vehicles: ${vehicleIds.size} upserted`);

  const existingRun = await prisma.ingestionRun.findFirst({
    where: { sourceFile: { startsWith: SOURCE_FILE_PREFIX } },
  });
  const run =
    existingRun ??
    (await prisma.ingestionRun.create({
      data: { sourceFile: SOURCE_FILE, rowsTotal: SAMPLE_PARTS.length },
    }));

  let fitmentCount = 0;

  for (const [index, row] of SAMPLE_PARTS.entries()) {
    const categoryId = categoryIds.get(row.category);
    const brandId = brandIds.get(row.brand);
    if (categoryId === undefined || brandId === undefined) {
      throw new Error(`unreachable: validate() should have caught ${row.code}`);
    }

    const vehicles = (row.fits ?? []).map((key) => {
      const vehicle = VEHICLES_BY_KEY.get(key);
      if (vehicle === undefined) throw new Error(`unreachable: unknown vehicle key ${key}`);
      return vehicle;
    });

    const attributes = buildAttributes(row, vehicles);
    const sourceKey = buildSourceKey(row.brand, row.code);
    const fields = {
      categoryId,
      brandId,
      rawName: row.name,
      normalizedName: normalizeName(row.name),
      partNumber: normalizeCode(row.code),
      attributes,
      // MANUAL, at full confidence, is the honest reading of `ParseSource`:
      // these attributes were typed by a human, not parsed out of a price
      // list by the lexicon or guessed at by an LLM. `parseConfidence` is
      // confidence in the *parse*, not in the real-world accuracy of the
      // part number — that caveat lives on the fitment and in the run label.
      parseConfidence: 1,
      parseSource: 'MANUAL' as const,
      needsReview: false,
      ...availabilityFor(index),
    };

    const part = await prisma.part.upsert({
      where: { sourceKey },
      create: { ...fields, sourceKey },
      update: fields,
    });

    await prisma.stagingRow.upsert({
      where: { runId_rowNumber: { runId: run.id, rowNumber: index + 1 } },
      create: {
        runId: run.id,
        rowNumber: index + 1,
        raw: { ...row },
        rawName: row.name,
        normalizedName: normalizeName(row.name),
        parsedAttributes: attributes,
        parseSource: 'MANUAL',
        parseConfidence: 1,
        partId: part.id,
        processedAt: new Date(),
      },
      update: {
        raw: { ...row },
        rawName: row.name,
        normalizedName: normalizeName(row.name),
        parsedAttributes: attributes,
        partId: part.id,
        processedAt: new Date(),
      },
    });

    for (const vehicle of vehicles) {
      const vehicleId = vehicleIds.get(vehicle.key);
      if (vehicleId === undefined) throw new Error(`unreachable: no id for vehicle ${vehicle.key}`);
      await prisma.partFitment.upsert({
        where: { partId_vehicleId: { partId: part.id, vehicleId } },
        create: { partId: part.id, vehicleId, source: 'INGESTED', notes: FITMENT_NOTE },
        update: { source: 'INGESTED', notes: FITMENT_NOTE },
      });
      fitmentCount += 1;
    }
  }

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status: 'COMPLETED',
      finishedAt: new Date(),
      rowsTotal: SAMPLE_PARTS.length,
      rowsParsedByRule: 0,
      rowsParsedByLlm: 0,
      rowsFlagged: 0,
      rowsFailed: 0,
      notes: 'Hand-entered sample rows. See src/seed/sample-parts.ts for how far the part numbers can be trusted.',
    },
  });

  console.log(`parts:    ${SAMPLE_PARTS.length} upserted`);
  console.log(`fitments: ${fitmentCount} upserted`);

  const byCategory = await prisma.category.findMany({
    select: { name: true, _count: { select: { parts: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('\nCatalogue now:');
  for (const c of byCategory) {
    console.log(`  ${c.name.padEnd(20)} ${String(c._count.parts).padStart(3)} parts`);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(await prisma.part.count()).padStart(3)} parts`);
  console.log('\nRun `npm run embed:parts` next — new parts are not searchable semantically until embedded.');
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

/**
 * Removes every trace of the sample catalogue, for when the real price lists
 * arrive. Ordering matters and is driven by the schema's own delete rules:
 *
 *   1. Parts go first. `PartFitment` and `PartEmbedding` cascade off them;
 *      `Brand`/`Category` are `onDelete: Restrict`, so those cannot be
 *      touched until their parts are gone.
 *   2. The part ids have to be collected BEFORE the delete —
 *      `StagingRow.partId` is `onDelete: SetNull`, so deleting the parts
 *      erases the only link back to them.
 *   3. Vehicles and brands are removed only when nothing else references
 *      them. The sample vehicles use 3-part identity keys and the GMB ones
 *      use 2-part, so they cannot collide — but a "no rows left pointing at
 *      it" check is a guarantee rather than an argument.
 */
async function purge(): Promise<void> {
  const runs = await prisma.ingestionRun.findMany({
    where: { sourceFile: { startsWith: SOURCE_FILE_PREFIX } },
    select: { id: true, sourceFile: true },
  });

  if (runs.length === 0) {
    console.log('Nothing to purge — no ingestion run whose sourceFile starts with "SAMPLE CATALOGUE".');
    return;
  }

  const runIds = runs.map((r) => r.id);
  const stagingRows = await prisma.stagingRow.findMany({
    where: { runId: { in: runIds }, partId: { not: null } },
    select: { partId: true },
  });
  const partIds = [...new Set(stagingRows.map((r) => r.partId).filter((id): id is string => id !== null))];

  const deletedParts = await prisma.part.deleteMany({ where: { id: { in: partIds } } });
  const deletedRuns = await prisma.ingestionRun.deleteMany({ where: { id: { in: runIds } } });

  const sampleIdentityKeys = SAMPLE_VEHICLES.map(vehicleIdentityKey);
  const deletedVehicles = await prisma.vehicle.deleteMany({
    where: { identityKey: { in: sampleIdentityKeys }, fitments: { none: {} } },
  });

  const deletedBrands = await prisma.brand.deleteMany({
    where: { name: { in: SAMPLE_BRANDS.map((b) => b.name) }, parts: { none: {} } },
  });

  console.log(`purged: ${deletedParts.count} parts, ${deletedRuns.count} ingestion run(s) (staging rows cascaded),`);
  console.log(`        ${deletedVehicles.count} now-unreferenced vehicles, ${deletedBrands.count} now-empty brands`);
  console.log(`parts remaining: ${await prisma.part.count()}`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--purge')) {
    await purge();
    return;
  }
  await seed();
}

main()
  .catch((err: unknown) => {
    console.error('\nseed-sample-catalogue failed:\n', err);
    process.exitCode = 1;
  })
  .finally(disconnect);
