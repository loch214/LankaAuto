/**
 * Builds the text that gets embedded for one part (Milestone 1C).
 *
 * This is deliberately its own pure function, not inlined into the embed
 * script, for two reasons:
 *
 * 1. It is unit-testable without a database or a network call — the
 *    difference between "the recipe is wrong" and "the API call failed" is
 *    the whole reason `PartEmbedding.sourceText` is recorded per row (see
 *    the schema comment): so a bad recipe is diagnosable and re-runnable
 *    without re-guessing what changed.
 * 2. `PLAN.md` §3 requires retrieval to be measured against a checked-in
 *    eval set, not by vibes — which means the recipe has to be a stable,
 *    inspectable thing you can hold constant while changing everything else.
 *
 * Recipe: brand, category, the raw price-list name (the actual words a
 * customer or staff member would type), the part number, and every fitment
 * fact available — both the structured `attributes` spans the ingester
 * parsed (model / chassis / engine / body) AND the resolved `vehicles` this
 * part is linked to via `part_fitments`. Both are included because they are
 * not redundant: `attributes` exists even for the ~1/3 of parts with no
 * resolved Vehicle row (e.g. "STEERING JOINT" rows with no model span at
 * all), and `part_fitments` carries the make even when `attributes.make` is
 * null (see `GU1638`, a real row with a blank make cell in the source PDF).
 *
 * Plain sentence-ish prose, not a keyword dump: Gemini's embedding model is
 * trained on natural text, and a customer's query ("u joint for a Toyota
 * Corolla") is prose too — matching the query's register end to end.
 */

export interface EmbeddingPartAttributes {
  readonly make?: string | null;
  readonly model?: readonly string[];
  readonly chassisCode?: readonly string[];
  readonly engine?: readonly string[];
  readonly body?: readonly string[];
  readonly inlineMake?: readonly string[];
  readonly fuel?: readonly string[];
}

export interface EmbeddingFitmentVehicle {
  readonly make: string;
  readonly model: string;
  readonly chassisCode: string | null;
}

export interface EmbeddingTextInput {
  readonly rawName: string;
  readonly partNumber: string | null;
  readonly brandName: string | null;
  readonly categoryName: string;
  readonly attributes: EmbeddingPartAttributes;
  readonly fitmentVehicles: readonly EmbeddingFitmentVehicle[];
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

function describeVehicle(v: EmbeddingFitmentVehicle): string {
  return v.chassisCode !== null ? `${v.make} ${v.model} (${v.chassisCode})` : `${v.make} ${v.model}`;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Reads `Part.attributes` (an untyped Prisma `Json` column — see the schema
 * comment: "Shape is per-category and governed by `Category.attributeSchema`,
 * UNENFORCED for now") into the shape this module expects, without trusting
 * it blindly. The only writer today is `buildAttributes` in
 * `scripts/ingest-gmb-ujoint.ts`, which always produces this shape — but the
 * column itself carries no compile-time guarantee of that, and a category
 * added later is explicitly allowed to use a different shape. Anything
 * malformed degrades to "no attribute", not a crash.
 */
export function parseEmbeddingAttributes(json: unknown): EmbeddingPartAttributes {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;
  const make = obj['make'];
  return {
    make: typeof make === 'string' ? make : null,
    model: toStringArray(obj['model']),
    chassisCode: toStringArray(obj['chassisCode']),
    engine: toStringArray(obj['engine']),
    body: toStringArray(obj['body']),
    inlineMake: toStringArray(obj['inlineMake']),
    fuel: toStringArray(obj['fuel']),
  };
}

export function buildEmbeddingText(input: EmbeddingTextInput): string {
  const attrs = input.attributes;

  /**
   * Sorted, because callers cannot promise an order. Both of them load
   * fitments with `fitments: { include: { vehicle: true } }` and no
   * `orderBy`, so Postgres returns whatever heap order it currently has —
   * and it is free to change that whenever those rows are rewritten, which
   * `seed-sample-catalogue.ts` does to all 138 of them on every run.
   *
   * "Same facts, different sentence" then breaks two things silently:
   *
   *   - `embed-parts.ts`'s incremental check compares the stored
   *     `source_text` to decide what to re-embed, so it re-embeds parts
   *     nothing has actually changed about (measured: 2 parts after one
   *     seed re-run, for a wasted API call each);
   *   - worse, the two callers disagree. `reembedPart` (fired by `PATCH
   *     /parts/:id`) and `embed-parts.ts` would each see the other's text as
   *     "changed" and rewrite it, indefinitely.
   *
   * Sorting here rather than adding an `orderBy` to each caller is
   * deliberate: "the same facts produce the same text" is a property of the
   * recipe, and a fix in one caller leaves the other one wrong. Plain string
   * comparison, not `localeCompare`, so the order cannot shift with the
   * machine's locale either.
   */
  const fitmentVehicles = [...input.fitmentVehicles].sort((a, b) => {
    const [left, right] = [describeVehicle(a), describeVehicle(b)];
    return left < right ? -1 : left > right ? 1 : 0;
  });

  // Every make hint the ingester found, from every source: the structured
  // `make` field, the fallback `inlineMake` span (a make name spotted inside
  // the fitment text itself rather than the dedicated column), and the
  // resolved fitment vehicles. Deduplicated because the same make commonly
  // shows up in more than one of these.
  const makes = uniq([
    ...(attrs.make !== null && attrs.make !== undefined ? [attrs.make] : []),
    ...(attrs.inlineMake ?? []),
    ...fitmentVehicles.map((v) => v.make),
  ]);

  const sentences: string[] = [];

  const brandBit = input.brandName !== null ? `${input.brandName} ` : '';
  const makeBit = makes.length > 0 ? ` for ${makes.join(', ')}` : '';
  sentences.push(`${brandBit}${input.categoryName}${makeBit}: ${input.rawName}.`);

  if (input.partNumber !== null) {
    sentences.push(`Part number ${input.partNumber}.`);
  }

  const fitmentDescriptions = fitmentVehicles.map(describeVehicle);
  if (fitmentDescriptions.length > 0) {
    sentences.push(`Fits: ${uniq(fitmentDescriptions).join(', ')}.`);
  }

  // Attribute spans not already covered by a resolved Vehicle row — a part
  // with no fitments (e.g. a bare "STEERING JOINT") still carries whatever
  // the ingester managed to parse out of the fitment text.
  const model = uniq(attrs.model ?? []);
  const chassis = uniq(attrs.chassisCode ?? []);
  const engine = uniq(attrs.engine ?? []);
  const body = uniq(attrs.body ?? []);
  const fuel = uniq(attrs.fuel ?? []);

  const extraBits: string[] = [];
  if (model.length > 0) extraBits.push(`model ${model.join(', ')}`);
  if (chassis.length > 0) extraBits.push(`chassis code ${chassis.join(', ')}`);
  if (engine.length > 0) extraBits.push(`engine ${engine.join(', ')}`);
  if (body.length > 0) extraBits.push(`body type ${body.join(', ')}`);
  if (fuel.length > 0) extraBits.push(`fuel ${fuel.join(', ')}`);
  if (extraBits.length > 0) {
    sentences.push(`Also known by ${extraBits.join(', ')}.`);
  }

  return sentences.join(' ');
}
