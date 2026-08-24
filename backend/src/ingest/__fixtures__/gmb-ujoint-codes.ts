/**
 * Every part code from the GMB U-Joint price list, verbatim as printed.
 *
 * Source: `GMB U JOINT-5.pdf`, GMB-U/JOINT-JAPAN, dated 2024-07-26, 62 rows.
 * Profile and reasoning: `backend/docs/01-source-profile-gmb-ujoint.md`
 *
 * Kept verbatim on purpose — the inconsistent spacing (`GUT11` vs `GUT 12`,
 * `GUKO4` vs `GUKO 12`) IS the thing under test. Do not tidy this list.
 *
 * The row count is the independent source of truth for the uniqueness
 * property: 62 rows in the document must yield 62 distinct source keys.
 */
export const GMB_UJOINT_CODES = [
  // Page 1 — Toyota
  'GUT11',
  'GUT 12',
  'GUT 13',
  'GUT 15',
  'GUT 17',
  'GUT 20',
  'GUT 21',
  'GUT 23',
  'GUT 24',
  'GUT 27',
  'GUT 28',
  'GUT 29',
  'GU 2200',
  // Page 1 — Nissan (note: not in numeric order in the source)
  'GUN 32',
  'GUN 34',
  'GUN 45',
  'GUN 46',
  'GUN 27',
  'GUN 28',
  'GUN 29',
  'GUN 31',
  'GUN 50',
  // Page 1 — Mitsubishi
  'GUM 75',
  'GUM 79',
  'GUM 81',
  'GUM 82',
  'GUM 88',
  'GUM 91',
  'GUM 92',
  'GUMZ 1',
  'GUM 85',
  'GUM 87',
  'GUM 93',
  'GUM 99',
  'GU 1000 HD',
  // Page 2 — Isuzu
  'GUIS 52',
  'GUIS 54',
  'GUIS 55',
  'GUIS 57',
  'GUIS 58',
  'GUIS 59',
  'GUIS 62',
  'GUIS 64',
  'GUIS 66',
  'GUIS 67',
  'GUIS 70',
  'GUIS 73',
  'GU 500',
  'GU 2000',
  // Page 2 — Austin, Mazda, Daihatsu
  'GU 1100',
  'GU 7280/4',
  'GUMZ 9',
  'GUMZ 12',
  'GUD 84',
  'GUMZ 3',
  // Page 2 — Komatsu
  'GUKO4',
  'GUKO5',
  'GUKO6',
  'GUKO 12',
  // Page 2 — steering joints (NOT U-joints, despite the file title)
  'GU 1538',
  'GU 1638',
  'GU 1948',
] as const;

/** Rows in the source document. The independent expected value. */
export const GMB_UJOINT_ROW_COUNT = 62;
