/**
 * Milestone 1A verification.
 *
 * "The migration ran without error" is a weaker claim than it sounds. It does
 * not prove the vector extension is usable, that the HNSW index actually
 * exists, or that the distance operator the index was built for is the one
 * queries will use. Each of those fails silently: a missing index gives
 * correct results at terrible speed, with no error to notice.
 *
 * Run: npm run check:db
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { prisma, disconnect } from "../lib/prisma.js";
//                                              ^^^
// NodeNext resolution requires the .js extension on relative imports even
// though the file on disk is .ts. TypeScript is describing the path that will
// exist at runtime, not the one in the source tree.

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main(): Promise<void> {
  // 1. Is the vector extension actually installed in THIS database?
  const ext = await prisma.$queryRaw<{ extversion: string }[]>`
    SELECT extversion FROM pg_extension WHERE extname = 'vector'
  `;
  record(
    "pgvector extension installed",
    ext.length > 0,
    ext[0] ? `version ${ext[0].extversion}` : "not found",
  );

  // 2. Did every table get created?
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
    ORDER BY tablename
  `;
  const expected = [
    "brands",
    "categories",
    "ingestion_runs",
    "part_embeddings",
    "part_fitments",
    "parts",
    "staging_rows",
    "users",
    "vehicles",
    "verification_log",
  ];
  const found = tables.map((t) => t.tablename);
  const missing = expected.filter((t) => !found.includes(t));
  record(
    "all tables created",
    missing.length === 0,
    missing.length === 0
      ? `${found.length} tables`
      : `missing: ${missing.join(", ")}`,
  );

  // 3. Tables that must NOT exist. PLAN.md §12 cuts cross_references and
  //    defers part_documents; if either reappears, someone added it without
  //    answering the question that blocked it.
  const forbidden = ["cross_references", "part_documents"].filter((t) =>
    found.includes(t),
  );
  record(
    "deferred tables absent",
    forbidden.length === 0,
    forbidden.length === 0
      ? "cross_references and part_documents correctly absent"
      : `unexpectedly present: ${forbidden.join(", ")}`,
  );

  // 4. Is the embedding column the real vector type, at the right width?
  //    A silent fallback to text or bytea would still accept inserts.
  const col = await prisma.$queryRaw<
    { data_type: string; udt_name: string }[]
  >`
    SELECT data_type, udt_name FROM information_schema.columns
    WHERE table_name = 'part_embeddings' AND column_name = 'embedding'
  `;
  record(
    "embedding column is vector type",
    col[0]?.udt_name === "vector",
    col[0] ? `udt_name = ${col[0].udt_name}` : "column not found",
  );

  const dim = await prisma.$queryRaw<{ dims: number }[]>`
    SELECT atttypmod AS dims FROM pg_attribute
    WHERE attrelid = 'part_embeddings'::regclass AND attname = 'embedding'
  `;
  record(
    "embedding dimension is 768",
    dim[0]?.dims === 768,
    `declared dimension = ${dim[0]?.dims ?? "unknown"}`,
  );

  // 5. Does the HNSW index exist, and is it built for cosine distance?
  //    An index built with a different opclass is invisible to `<=>` queries.
  const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'part_embeddings'
      AND indexname = 'part_embeddings_embedding_hnsw_idx'
  `;
  const def = idx[0]?.indexdef ?? "";
  record(
    "HNSW index exists",
    idx.length > 0,
    idx.length > 0 ? "found" : "MISSING — semantic search will seq-scan",
  );
  record(
    "HNSW index uses cosine opclass",
    def.includes("vector_cosine_ops"),
    def.includes("vector_cosine_ops")
      ? "vector_cosine_ops (matches the <=> operator)"
      : `opclass mismatch: ${def || "n/a"}`,
  );

  // 6. GIN index on the JSONB attribute column (Phase 2 browse filters).
  const gin = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'parts' AND indexdef ILIKE '%gin%'
  `;
  record(
    "GIN index on parts.attributes",
    gin.length > 0 && (gin[0]?.indexdef.includes("jsonb_path_ops") ?? false),
    gin[0]?.indexdef.includes("jsonb_path_ops")
      ? "jsonb_path_ops"
      : "missing or wrong opclass",
  );

  // 6b. pg_trgm extension + the GIN trigram index backing fuzzy part-number
  //     search (Phase 3). Same silent-failure shape as the vector checks
  //     above: a missing index gives correct results at a sequential-scan
  //     crawl, with nothing in the app layer to say why.
  const trgmExt = await prisma.$queryRaw<{ extversion: string }[]>`
    SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm'
  `;
  record(
    "pg_trgm extension installed",
    trgmExt.length > 0,
    trgmExt[0] ? `version ${trgmExt[0].extversion}` : "not found",
  );

  const trgmIdx = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'parts' AND indexname = 'parts_part_number_trgm_idx'
  `;
  const trgmDef = trgmIdx[0]?.indexdef ?? "";
  record(
    "GIN trigram index on parts.part_number",
    trgmDef.includes("gin_trgm_ops"),
    trgmDef.includes("gin_trgm_ops")
      ? "gin_trgm_ops (matches the % operator / similarity())"
      : "missing or wrong opclass — fuzzy part-number search will seq-scan",
  );

  // 7. Do vector operations actually run? Cosine distance between two
  //    orthogonal unit vectors is exactly 1 — a cheap end-to-end proof that
  //    the extension works, not merely that it is listed.
  const distance = await prisma.$queryRaw<{ d: number }[]>`
    SELECT ('[1,0,0]'::vector(3) <=> '[0,1,0]'::vector(3)) AS d
  `;
  record(
    "cosine distance operator works",
    Math.abs((distance[0]?.d ?? -1) - 1) < 1e-9,
    `orthogonal vectors → distance ${distance[0]?.d}`,
  );

  // 8. Source-level guard, not a database check.
  //
  //    Prisma cannot see the HNSW index, so every `migrate dev` generates a
  //    migration that DROPs it. The instruction is "delete that line" — and
  //    an instruction a human must remember forever is a defect waiting to
  //    happen. This turns it into a failing check instead.
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, "../../prisma/migrations");
  const offenders: string[] = [];

  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(migrationsDir, entry.name, "migration.sql");
    let body: string;
    try {
      body = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Ignore the explanatory comments; only real statements matter.
    const statements = body
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    if (/DROP\s+INDEX[^;]*part_embeddings_embedding_hnsw_idx/i.test(statements)) {
      offenders.push(entry.name);
    }
  }

  record(
    "no migration drops the HNSW index",
    offenders.length === 0,
    offenders.length === 0
      ? "clean"
      : `DELETE the DROP INDEX line from: ${offenders.join(", ")}`,
  );

  // --- report -------------------------------------------------------------
  const pad = Math.max(...checks.map((c) => c.name.length));
  console.log("");
  for (const c of checks) {
    console.log(
      `  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(pad)}  ${c.detail}`,
    );
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  if (failed.length > 0) {
    console.log(`  ${failed.length} of ${checks.length} checks FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`  All ${checks.length} checks passed.`);
  }
}

main()
  .catch((err: unknown) => {
    console.error("\n  check-db crashed:\n", err);
    process.exitCode = 1;
  })
  .finally(disconnect);
