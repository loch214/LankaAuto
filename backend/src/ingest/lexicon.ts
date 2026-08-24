/**
 * The typed lexicon.
 *
 * One source column mixes several different kinds of thing — see
 * `backend/docs/01-source-profile-gmb-ujoint.md` §5. A flat token list cannot
 * represent that, so every entry declares its `type` and the extractor emits
 * typed spans rather than a single "model" string.
 *
 * `surfaces` are the forms that actually appear in price lists, including
 * misspellings. The same GMB file spells one model two ways (`HI-LUC` and
 * `HI-LUX`), so aliasing is not a nicety — it is required to avoid splitting
 * one model into two.
 *
 * Entries are hand-built by inspecting real token distributions, driven by the
 * coverage test in `parse-fitment.test.ts`, which prints every unresolved
 * token. **Do not add a surface form that has not been seen in a real file.**
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
  /**
   * A marque appearing INSIDE the fitment column rather than the make column
   * — `UD`, `FUSO`, `BMC`. Other price lists carry the brand inline in one
   * string, so this type is needed beyond this file.
   */
  | 'make'
  /** Fuel type, where the row distinguishes on it: `L300 DIESEL,PAJERO`. */
  | 'fuel'
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
  // --- Toyota models -----------------------------------------------------
  { canonical: 'COROLLA', type: 'model', surfaces: ['COROLLA'] },
  { canonical: 'CORONA', type: 'model', surfaces: ['CORONA'] },
  { canonical: 'CARINA', type: 'model', surfaces: ['CARINA'] },
  { canonical: 'HIACE', type: 'model', surfaces: ['HIACE'] },
  { canonical: 'DYNA', type: 'model', surfaces: ['DYNA'] },
  { canonical: 'COASTER', type: 'model', surfaces: ['COASTER'] },
  // The slash is INSIDE these names. Because matching is longest-first over
  // surface forms, listing them here is what stops the splitter reaching them.
  { canonical: 'TOYOACE', type: 'model', surfaces: ['T/ACE', 'TOYOACE'] },
  { canonical: 'LITEACE', type: 'model', surfaces: ['L/ACE', 'LITEACE'] },
  // `HI-LUC` and `HI-LUX` appear in the SAME file (GUT 27 and GUT 29).
  { canonical: 'HILUX', type: 'model', surfaces: ['HI-LUX', 'HI-LUC', 'HILUX'] },
  { canonical: 'VIGO', type: 'model', surfaces: ['VIGO'] },

  // --- Nissan models -----------------------------------------------------
  { canonical: 'CIVILIAN', type: 'model', surfaces: ['CIVILIAN'] },
  { canonical: 'SUNNY', type: 'model', surfaces: ['SUNNY'] },
  { canonical: 'CARAVAN', type: 'model', surfaces: ['CARAVAN'] },
  { canonical: 'ATLAS', type: 'model', surfaces: ['ATLAS'] },
  { canonical: 'NAVARA', type: 'model', surfaces: ['NAVARA'] },

  // --- Mitsubishi models -------------------------------------------------
  { canonical: 'CANTER', type: 'model', surfaces: ['CANTER'] },
  { canonical: 'ROSA', type: 'model', surfaces: ['ROSA'] },
  { canonical: 'DELICA', type: 'model', surfaces: ['DELICA'] },
  { canonical: 'L300', type: 'model', surfaces: ['L300'] },
  { canonical: 'PAJERO', type: 'model', surfaces: ['PAJERO'] },
  { canonical: 'MINICAB', type: 'model', surfaces: ['MINICAB'] },
  { canonical: 'LANCER', type: 'model', surfaces: ['LANCER'] },

  // --- Isuzu models ------------------------------------------------------
  // Declared shortest-first on purpose. `ELF` is a prefix of `ELF150` and
  // `ELF250`, but that pair resolves correctly on `isBoundary` alone — `1`
  // right after `ELF` is not a separator, so a bare `ELF` match is rejected
  // regardless of declaration order. This ordering exists to keep the
  // parse-fitment.test.ts regression test honest about which mechanism it
  // is exercising (boundary checking, not the length sort).
  { canonical: 'ELF', type: 'model', surfaces: ['ELF'] },
  { canonical: 'ELF150', type: 'model', surfaces: ['ELF150'] },
  { canonical: 'ELF250', type: 'model', surfaces: ['ELF250'] },
  { canonical: 'DA120', type: 'model', surfaces: ['DA120'] },
  { canonical: 'TROOPER', type: 'model', surfaces: ['TROOPER', 'TROOFER'] },

  // --- Mazda / other models ----------------------------------------------
  { canonical: 'BONGO', type: 'model', surfaces: ['BONGO'] },
  { canonical: '929', type: 'model', surfaces: ['929'] },
  { canonical: 'B2200', type: 'model', surfaces: ['B2200'] },
  { canonical: 'LD', type: 'model', surfaces: ['LD'] },
  // A Komatsu bulldozer, not a road vehicle. Docs §5.
  { canonical: 'D30', type: 'model', surfaces: ['D30'] },

  // --- Marques appearing inside the fitment column ------------------------
  { canonical: 'UD', type: 'make', surfaces: ['UD'] },
  { canonical: 'FUSO', type: 'make', surfaces: ['FUSO'] },
  { canonical: 'BMC', type: 'make', surfaces: ['BMC'] },

  // --- Chassis codes -----------------------------------------------------
  { canonical: 'LH113', type: 'chassis', surfaces: ['LH113'] },
  { canonical: 'LN85', type: 'chassis', surfaces: ['LN85'] },
  { canonical: 'B210', type: 'chassis', surfaces: ['B210'] },
  { canonical: 'B310', type: 'chassis', surfaces: ['B310'] },
  { canonical: 'D21', type: 'chassis', surfaces: ['D21'] },
  { canonical: 'U61', type: 'chassis', surfaces: ['U61'] },
  { canonical: 'NKR', type: 'chassis', surfaces: ['NKR'] },
  { canonical: 'JCR', type: 'chassis', surfaces: ['JCR'] },
  { canonical: 'TXD', type: 'chassis', surfaces: ['TXD'] },

  // --- Engines -----------------------------------------------------------
  { canonical: '15B', type: 'engine', surfaces: ['15B'] },
  // Hino engine families use a DIGIT zero. The price list prints a letter O.
  // Both surfaces map to the same canonical form, so it does not matter
  // whether the error is the typist's or the PDF extractor's. Docs §7.
  { canonical: 'S05C', type: 'engine', surfaces: ['S05C', 'SO5C'] },
  { canonical: 'J05C', type: 'engine', surfaces: ['J05C', 'JO5C'] },
  { canonical: '4M40', type: 'engine', surfaces: ['4M40'] },
  { canonical: '4HL1', type: 'engine', surfaces: ['4HL1'] },
  { canonical: 'ED30', type: 'engine', surfaces: ['ED30'] },
  { canonical: 'V6', type: 'engine', surfaces: ['V6'] },
  // Mazda two-letter engine families. Short and ambiguous-looking, but they
  // only ever appear in engine position in this corpus.
  { canonical: 'R2', type: 'engine', surfaces: ['R2'] },
  { canonical: 'RF', type: 'engine', surfaces: ['RF'] },
  { canonical: 'SL', type: 'engine', surfaces: ['SL'] },
  { canonical: 'TF', type: 'engine', surfaces: ['TF'] },
  { canonical: 'TM', type: 'engine', surfaces: ['TM'] },

  // --- Body style / drivetrain -------------------------------------------
  { canonical: 'DOUBLE CAB', type: 'body', surfaces: ['D/CAB'] },
  { canonical: 'CAB', type: 'body', surfaces: ['CAB'] },
  { canonical: 'VAN', type: 'body', surfaces: ['VAN'] },
  { canonical: 'TRUCK', type: 'body', surfaces: ['TRUCK'] },
  { canonical: 'LORRY', type: 'body', surfaces: ['LORRY'] },
  { canonical: 'TIPPER', type: 'body', surfaces: ['TIPPER', 'TIPER'] },
  { canonical: 'JEEP', type: 'body', surfaces: ['JEEP'] },
  { canonical: 'BOX', type: 'body', surfaces: ['BOX'] },
  { canonical: '4WD', type: 'body', surfaces: ['4WD'] },

  // --- Fuel --------------------------------------------------------------
  { canonical: 'DIESEL', type: 'fuel', surfaces: ['DIESEL'] },

  // --- Product types -----------------------------------------------------
  // Present because the file title lies: 3 of 62 rows in `GMB-U/JOINT` are
  // steering joints, so part type has to stay row-derivable. Docs §3.
  { canonical: 'STEERING JOINT', type: 'product_type', surfaces: ['STEERING JOINT'] },
];
