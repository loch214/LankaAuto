/**
 * Checked-in eval set for semantic search (Milestone 1C, required by
 * PLAN.md §3: retrieval quality is measured against this, "not by vibes").
 *
 * Every query is hand-labeled against the real, ingested 62-row GMB U-Joint
 * list (`src/ingest/__fixtures__/gmb-ujoint-rows.ts` /
 * `docs/01-source-profile-gmb-ujoint.md`) — not invented data. Expected
 * answers are `partNumber` values (the human-readable code, e.g. "GUT11"),
 * not database ids, because a part number is what survives a `db:reset` and
 * what a person actually hand-labels against; `run-eval.ts` resolves these
 * to ids at run time.
 *
 * Honest limits, worth reading before trusting the printed recall number:
 *
 * - 62 parts, one category family (U-joints / steering joints), one brand
 *   (GMB) is a thin, easy corpus — there is little else nearby for a query
 *   to be confused with. A general CSV/PDF loader bringing in more
 *   categories (still unbuilt) would make this a harder, more meaningful
 *   test. Don't over-read a high score here as "retrieval is solved."
 * - The 8 categories seeded in a later session (Engine Parts, Brake Parts,
 *   etc.) have zero parts and contribute nothing to this eval set.
 * - Several queries below (labeled) test whether pure semantic search finds
 *   an *exact part code* — a known weak spot for embeddings versus literal
 *   keyword matching. A low score there is not a bug in this eval set; it is
 *   exactly the evidence PLAN.md §3 wants for choosing hybrid retrieval
 *   (exact + fuzzy + vector) over vector-search-alone in Phase 3.
 */

export interface EvalQuery {
  readonly id: string;
  readonly query: string;
  readonly expectedPartNumbers: readonly string[];
  readonly note?: string;
}

export const EVAL_QUERIES: readonly EvalQuery[] = [
  // --- A. Exact code lookup ------------------------------------------------
  { id: 'code-01', query: 'GUT11', expectedPartNumbers: ['GUT11'], note: 'exact code, no punctuation' },
  { id: 'code-02', query: 'GU 1100', expectedPartNumbers: ['GU1100'], note: 'exact code, space the source is inconsistent about' },
  { id: 'code-03', query: 'guko12', expectedPartNumbers: ['GUKO12'], note: 'exact code, lowercase' },
  { id: 'code-04', query: 'GU7280/4', expectedPartNumbers: ['GU7280/4'], note: 'exact code with punctuation preserved' },
  { id: 'code-05', query: 'GUMZ 1', expectedPartNumbers: ['GUMZ1'], note: 'exact code, space' },
  { id: 'code-06', query: 'part number GU500', expectedPartNumbers: ['GU500'], note: 'code inside a short phrase' },
  { id: 'code-07', query: 'GU1638', expectedPartNumbers: ['GU1638'], note: 'exact code for the one row with a blank make cell' },

  // --- B. Brand + model, natural language ----------------------------------
  { id: 'fit-01', query: 'u joint for a Toyota Corolla', expectedPartNumbers: ['GUT11'] },
  { id: 'fit-02', query: 'universal joint for Toyota Hiace', expectedPartNumbers: ['GUT12', 'GUT21'] },
  { id: 'fit-03', query: 'u-joint for Toyota Dyna', expectedPartNumbers: ['GUT15', 'GUT20', 'GUT28', 'GU2200'] },
  { id: 'fit-04', query: 'Nissan Sunny u joint', expectedPartNumbers: ['GUN28', 'GUN45'] },
  { id: 'fit-05', query: 'Mitsubishi Pajero u joint', expectedPartNumbers: ['GUM88', 'GUM91'] },
  { id: 'fit-06', query: 'Mitsubishi Canter u joint', expectedPartNumbers: ['GUM75', 'GUM87', 'GUM93'] },
  { id: 'fit-07', query: 'Isuzu Elf u joint', expectedPartNumbers: ['GU500', 'GUIS52', 'GUIS66'] },
  { id: 'fit-08', query: 'Mazda Bongo u joint', expectedPartNumbers: ['GU7280/4', 'GUMZ9'] },
  {
    id: 'fit-09',
    query: 'Toyota Hilux u joint',
    expectedPartNumbers: ['GUT27', 'GUT29'],
    note: 'source spells GUT27 as "HI-LUC" (a transcription quirk, see fixture comments) — tests whether the model still connects it to "Hilux"',
  },
  { id: 'fit-10', query: 'Nissan Navara u joint', expectedPartNumbers: ['GUN50'] },

  // --- C. Category / generic ------------------------------------------------
  { id: 'cat-01', query: 'steering joint', expectedPartNumbers: ['GU1538', 'GU1638', 'GU1948'] },
  { id: 'cat-02', query: 'steering joint for Mitsubishi', expectedPartNumbers: ['GU1538'] },
  { id: 'cat-03', query: 'steering joint for Isuzu', expectedPartNumbers: ['GU1948'] },
  { id: 'cat-04', query: 'lorry u joint', expectedPartNumbers: ['GU2000', 'GUIS58', 'GUIS59', 'GUIS64', 'GUIS67'] },
  { id: 'cat-05', query: 'Komatsu D30 u joint', expectedPartNumbers: ['GUKO4', 'GUKO5', 'GUKO6', 'GUKO12'] },

  // --- D. Vehicle-only (make not stated in the query) ----------------------
  { id: 'veh-01', query: 'u joint for a Corolla', expectedPartNumbers: ['GUT11'] },
  { id: 'veh-02', query: 'u joint for a Lancer', expectedPartNumbers: ['GUMZ1', 'GUM85'] },
  { id: 'veh-03', query: 'u joint for an L300', expectedPartNumbers: ['GUM81', 'GUM91'] },
  { id: 'veh-04', query: 'u joint for an Atlas truck', expectedPartNumbers: ['GUN31'] },
  { id: 'veh-05', query: 'u joint for a Delica van', expectedPartNumbers: ['GUM79'] },

  // --- E. Paraphrase / synonym ----------------------------------------------
  { id: 'para-01', query: 'part for a jeep', expectedPartNumbers: ['GU1000HD', 'GUD84'] },
  { id: 'para-02', query: 'coaster bus u joint', expectedPartNumbers: ['GUT20'] },
  { id: 'para-03', query: 'double cab 4wd u joint', expectedPartNumbers: ['GUN29'] },
  { id: 'para-04', query: 'Fuso truck u joint', expectedPartNumbers: ['GUM82'] },
  { id: 'para-05', query: 'minicab u joint', expectedPartNumbers: ['GUM92'] },

  // --- F. A few more brand/model queries and one more exact code, to bring
  //        the set closer to PLAN.md §11's "30–50 hand-labelled queries" ---
  { id: 'fit-11', query: 'Nissan D21 pickup u joint', expectedPartNumbers: ['GUN46'] },
  { id: 'fit-12', query: 'Nissan UD truck u joint', expectedPartNumbers: ['GUN32'] },
  { id: 'fit-13', query: 'Nissan Caravan u joint', expectedPartNumbers: ['GUN27'] },
  { id: 'fit-14', query: 'Lancer box body u joint', expectedPartNumbers: ['GUM85'] },
  { id: 'code-08', query: 'GUIS73', expectedPartNumbers: ['GUIS73'], note: 'exact code' },
];
