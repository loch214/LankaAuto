/**
 * The typed lexicon.
 *
 * One source column mixes five different kinds of thing — see
 * `backend/docs/01-source-profile-gmb-ujoint.md` §5. A flat token list cannot
 * represent that, so every entry declares its `type` and the extractor emits
 * typed spans rather than a single "model" string.
 *
 * `surfaces` are the forms that actually appear in price lists, including
 * misspellings. The same GMB file spells one model two ways (`HI-LUC` and
 * `HI-LUX`), so aliasing is not a nicety — it is required to avoid splitting
 * one model into two.
 *
 * Entries are hand-built by inspecting real token distributions. Do not add a
 * surface form that has not been seen in a real file.
 */

export type SpanType =
  /** A vehicle model name: COROLLA, PAJERO, CANTER. */
  | 'model'
  /** A chassis or body code: LH113, B210, U61. */
  | 'chassis'
  /** An engine designation: 15B, 4M40, S05C. */
  | 'engine'
  /** Body style or drivetrain: CAB, D/CAB, LORRY, 4WD. */
  | 'body'
  /** The part itself, when the row names it: STEERING JOINT. */
  | 'product_type'
  /** Matched nothing in the lexicon. Feeds the LLM fallback. */
  | 'unknown';

export interface LexiconEntry {
  /** The single normalized form written to the database. */
  readonly canonical: string;
  readonly type: Exclude<SpanType, 'unknown'>;
  /** Every form seen in a real price list, misspellings included. */
  readonly surfaces: readonly string[];
}

export const LEXICON: readonly LexiconEntry[] = [
  // --- Toyota ------------------------------------------------------------
  { canonical: 'COROLLA', type: 'model', surfaces: ['COROLLA'] },
  { canonical: 'CORONA', type: 'model', surfaces: ['CORONA'] },
  { canonical: 'CARINA', type: 'model', surfaces: ['CARINA'] },
  // The slash is INSIDE these names. Because matching is longest-first over
  // surface forms, listing them here is what stops the splitter reaching them.
  { canonical: 'TOYOACE', type: 'model', surfaces: ['T/ACE', 'TOYOACE'] },
  { canonical: 'LITEACE', type: 'model', surfaces: ['L/ACE', 'LITEACE'] },
  { canonical: 'DYNA', type: 'model', surfaces: ['DYNA'] },
  // `HI-LUC` and `HI-LUX` appear in the SAME file (GUT 27 and GUT 29).
  { canonical: 'HILUX', type: 'model', surfaces: ['HI-LUX', 'HI-LUC', 'HILUX'] },

  // --- Engines -----------------------------------------------------------
  { canonical: '15B', type: 'engine', surfaces: ['15B'] },
  // Hino engine families use a DIGIT zero. The price list prints a letter O.
  // Both surfaces map to the same canonical form, so it does not matter
  // whether the error is the typist's or the PDF extractor's. Docs §7.
  { canonical: 'S05C', type: 'engine', surfaces: ['S05C', 'SO5C'] },
  { canonical: 'J05C', type: 'engine', surfaces: ['J05C', 'JO5C'] },
  { canonical: '4M40', type: 'engine', surfaces: ['4M40'] },

  // --- Chassis codes -----------------------------------------------------
  { canonical: 'LN85', type: 'chassis', surfaces: ['LN85'] },

  // --- Body style / drivetrain -------------------------------------------
  { canonical: '4WD', type: 'body', surfaces: ['4WD'] },

  // --- Product types -----------------------------------------------------
  // Present because the file title lies: 3 of 62 rows in `GMB-U/JOINT` are
  // steering joints, so part type has to stay row-derivable. Docs §3.
  { canonical: 'STEERING JOINT', type: 'product_type', surfaces: ['STEERING JOINT'] },
];
