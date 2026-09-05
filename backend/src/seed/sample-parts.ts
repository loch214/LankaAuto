/**
 * A realistic sample catalogue — 116 rows spread across the eight categories
 * that `seed-categories.ts` creates but nothing ever filled.
 *
 * ## Why this file exists
 *
 * Before it, `parts` held 62 rows and every one of them was a GMB U-joint or
 * steering joint from the one real price list that has been transcribed so
 * far (`ingest-gmb-ujoint.ts`). Eight of the ten categories were empty. That
 * makes most of the app unexercisable: the browse page's category filter has
 * nine dead options, the reports page has one category to report on, and the
 * chat agent answers "no, we don't stock that" to every question that isn't
 * about a U-joint — which looks like a broken agent rather than an empty
 * catalogue. The real price lists are not arriving soon, so this stands in
 * for them.
 *
 * ## How honest this data is — read before trusting a number
 *
 * Three different grades of certainty are mixed in here deliberately, and
 * the difference matters:
 *
 * 1. **Codes that ARE the industry-wide part number.** A bearing really is
 *    called `6203-2RS`, an H4 bulb really is Osram `64193`, a JIS battery
 *    really is `NS40ZL`, a Gates belt really is `6PK1195`. These are exact.
 * 2. **Widely published OEM numbers.** `90915-YZZE1` (Toyota oil filter),
 *    `15208-65F0E` (Nissan oil filter), `15400-PLM-A02` (Honda oil filter),
 *    `04465-02220` (Toyota front pads) and similar. These are real numbers
 *    for real parts.
 * 3. **Real manufacturer numbering schemes with a plausible suffix.** Toyota
 *    genuinely numbers front fenders `53801-`/`53802-`, headlamps
 *    `81130-`/`81150-`, clutch discs `31250-`, alternators `27060-`, and
 *    the `-02` family suffix genuinely means Corolla. The prefix and the
 *    shape are right; the exact five digits after it are not something this
 *    file can certify against a catalogue.
 *
 * So: **nothing in here has been checked against the shop's own price
 * lists, and grade-3 rows should be treated as placeholders.** Three things
 * make that structurally visible rather than a comment nobody reads:
 *
 *   - every part seeded from this file is linked to a `StagingRow` on one
 *     `IngestionRun` whose `sourceFile` starts with `SAMPLE CATALOGUE`, so
 *     "which parts are demo data?" is a query, not a guess;
 *   - every `PartFitment` is written with `source: INGESTED` and the
 *     default 0.5 confidence, never `STAFF` — so `checkFitment` can only
 *     ever answer "on record (ingested from the price list)", and the
 *     agent's CONFIRMED verdict never claims a human checked it;
 *   - `npm run seed:sample -- --purge` deletes all of it in one command
 *     when the real lists show up.
 *
 * `folderLabel` and `recordNumber` are left null on purpose. They are the
 * staff-only "go pull the paper copy" citation, and pointing a staff member
 * at folder 4 record 37 for a part that isn't in that folder is worse than
 * admitting there is no citation.
 *
 * ## Two deliberate omissions
 *
 * **No sample parts are filed under the GMB brand.** GMB is the one brand
 * whose 62 rows came off a real price list; mixing unverified rows into it
 * would destroy the only clean provenance in the database.
 *
 * **Some rows carry no `fits` at all.** That is not an oversight — a
 * bearing, a bulb, a battery and a belt are sold at the counter by
 * dimension or fitting code, not by vehicle, and inventing a vehicle list
 * for them would be fabrication. It also keeps the "part with no resolved
 * Vehicle row" path exercised, which `build-embedding-text.ts`'s header
 * calls out as a real case (~1/3 of the GMB rows).
 */

/** A category slug that `seed-categories.ts` guarantees exists. */
export type SampleCategorySlug =
  | 'engine-parts'
  | 'brake-parts'
  | 'suspension-parts'
  | 'shock-absorbers'
  | 'gearbox-parts'
  | 'electrical-parts'
  | 'lights-mirrors'
  | 'body-parts';

export interface SampleBrand {
  readonly name: string;
  readonly isOem: boolean;
  readonly country: string;
}

/**
 * Every brand referenced below. All are genuinely sold in Sri Lanka.
 *
 * The vehicle manufacturers are named "TOYOTA GENUINE" rather than "TOYOTA"
 * on purpose: `Brand` is the *part* brand, and a bare "TOYOTA" in the brand
 * filter next to a "TOYOTA" in the vehicle-make filter is two different
 * things wearing the same label. "Toyota genuine" is also what a counter
 * actually calls the boxed OEM part.
 */
export const SAMPLE_BRANDS: readonly SampleBrand[] = [
  { name: 'TOYOTA GENUINE', isOem: true, country: 'Japan' },
  { name: 'NISSAN GENUINE', isOem: true, country: 'Japan' },
  { name: 'SUZUKI GENUINE', isOem: true, country: 'Japan' },
  { name: 'HONDA GENUINE', isOem: true, country: 'Japan' },
  { name: 'MITSUBISHI GENUINE', isOem: true, country: 'Japan' },
  { name: 'NWB', isOem: true, country: 'Japan' },
  { name: 'AISIN', isOem: true, country: 'Japan' },
  { name: 'DENSO', isOem: true, country: 'Japan' },
  { name: 'NGK', isOem: false, country: 'Japan' },
  { name: 'KYB', isOem: true, country: 'Japan' },
  { name: 'AKEBONO', isOem: true, country: 'Japan' },
  { name: 'NISSHINBO', isOem: false, country: 'Japan' },
  { name: 'MK KASHIYAMA', isOem: false, country: 'Japan' },
  { name: 'EXEDY', isOem: true, country: 'Japan' },
  { name: 'GATES', isOem: false, country: 'USA' },
  { name: '555', isOem: false, country: 'Japan' },
  { name: 'KOYO', isOem: true, country: 'Japan' },
  { name: 'NTN', isOem: true, country: 'Japan' },
  { name: 'NOK', isOem: true, country: 'Japan' },
  { name: 'VIC', isOem: false, country: 'Japan' },
  { name: 'AMARON', isOem: false, country: 'India' },
  { name: 'EXIDE', isOem: false, country: 'India' },
  { name: 'OSRAM', isOem: false, country: 'Germany' },
  { name: 'PHILIPS', isOem: false, country: 'Netherlands' },
];

export interface SamplePart {
  readonly brand: string;
  readonly code: string;
  /**
   * The price-list-style row text. Stored verbatim in `Part.rawName` (the
   * schema calls it "the original price-list string, never modified") and
   * uppercased into `normalizedName`, which is what the browse page's
   * keyword search does `contains` against — so the words a customer would
   * actually type need to be in here. It is also the sentence the embedding
   * is built around, which is why these read as a phrase and not a code
   * dump.
   */
  readonly name: string;
  readonly category: SampleCategorySlug;
  /** Primary vehicle make, or null for a part sold by dimension/fitting code. */
  readonly make: string | null;
  /** FRONT / REAR / RH / LH etc. Surfaced on the part detail page's attribute list. */
  readonly position?: string;
  /** Engine codes the part is specified for, beyond whatever the fitted vehicles imply. */
  readonly engine?: readonly string[];
  /** Keys from `SAMPLE_VEHICLES`. Empty/absent means "sold by size, not by vehicle". */
  readonly fits?: readonly string[];
}

export const SAMPLE_PARTS: readonly SamplePart[] = [
  // =========================================================================
  // ENGINE PARTS — filters, plugs, belts, water pumps
  // =========================================================================
  {
    brand: 'TOYOTA GENUINE', code: '90915-YZZE1',
    name: 'OIL FILTER TOYOTA COROLLA AE100 / AE110, HIACE LH SERIES',
    category: 'engine-parts', make: 'TOYOTA', engine: ['5A-FE', '4A-FE', '3L'],
    fits: ['corolla-ae100', 'corolla-ae110', 'hiace-lh113'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '04152-YZZA1',
    name: 'OIL FILTER ELEMENT (CARTRIDGE TYPE) TOYOTA AXIO, COROLLA ZRE, PRIUS, AQUA',
    category: 'engine-parts', make: 'TOYOTA', engine: ['1NZ-FE', '2ZR-FE', '2ZR-FXE', '1NZ-FXE'],
    fits: ['axio-nze141', 'corolla-zre142', 'prius-zvw30', 'aqua-nhp10'],
  },
  {
    brand: 'NISSAN GENUINE', code: '15208-65F0E',
    name: 'OIL FILTER NISSAN SUNNY FB13 / N16, MARCH K11',
    category: 'engine-parts', make: 'NISSAN', engine: ['GA15DE', 'QG15DE', 'CG10DE'],
    fits: ['sunny-fb13', 'sunny-n16', 'march-k11'],
  },
  {
    brand: 'HONDA GENUINE', code: '15400-PLM-A02',
    name: 'OIL FILTER HONDA FIT GD1 / GE6, CIVIC FD1',
    category: 'engine-parts', make: 'HONDA', engine: ['L13A', 'R18A'],
    fits: ['fit-gd1', 'fit-ge6', 'civic-fd1'],
  },
  {
    brand: 'VIC', code: 'C-224',
    name: 'OIL FILTER VIC C-224 TOYOTA 4A-FE / 5A-FE',
    category: 'engine-parts', make: 'TOYOTA', engine: ['4A-FE', '5A-FE'],
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '17801-0D010',
    name: 'AIR FILTER TOYOTA COROLLA NZE121, AXIO NZE141',
    category: 'engine-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121', 'axio-nze141'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '17801-21050',
    name: 'AIR FILTER TOYOTA PRIUS ZVW30, AQUA NHP10 (HYBRID)',
    category: 'engine-parts', make: 'TOYOTA', engine: ['2ZR-FXE', '1NZ-FXE'],
    fits: ['prius-zvw30', 'aqua-nhp10'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '17801-0C010',
    name: 'AIR FILTER TOYOTA HILUX VIGO KUN25, HIACE KDH200 (2KD-FTV DIESEL)',
    category: 'engine-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hilux-kun25', 'hiace-kdh200'],
  },
  {
    brand: 'SUZUKI GENUINE', code: '13780-58M00',
    name: 'AIR FILTER SUZUKI WAGON R MH34S / MH44S, ALTO HA36S (R06A)',
    category: 'engine-parts', make: 'SUZUKI', engine: ['R06A'],
    fits: ['wagonr-mh34s', 'wagonr-mh44s', 'alto-ha36s'],
  },
  {
    brand: 'NGK', code: 'BKR6E-11',
    name: 'SPARK PLUG NGK BKR6E-11 NICKEL (STOCK NO. 2756)',
    category: 'engine-parts', make: null, engine: ['4A-FE', 'QG15DE', '4G13', 'ZL-DE'],
    fits: ['corolla-ae110', 'sunny-n16', 'lancer-ck1', 'familia-bj'],
  },
  {
    brand: 'NGK', code: 'IFR6A11',
    name: 'SPARK PLUG NGK IRIDIUM IFR6A11 TOYOTA 1NZ-FE',
    category: 'engine-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121', 'axio-nze141'],
  },
  {
    brand: 'DENSO', code: 'K20PR-U11',
    name: 'SPARK PLUG DENSO K20PR-U11 NICKEL TOYOTA 4A-FE / 5A-FE',
    category: 'engine-parts', make: 'TOYOTA', engine: ['4A-FE', '5A-FE'],
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: 'AISIN', code: 'WPT-050',
    name: 'WATER PUMP TOYOTA COROLLA AE100 / AE110 (AISIN)',
    category: 'engine-parts', make: 'TOYOTA', engine: ['4A-FE', '5A-FE'],
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: 'AISIN', code: 'WPN-055',
    name: 'WATER PUMP NISSAN SUNNY N16 QG15DE (AISIN)',
    category: 'engine-parts', make: 'NISSAN', engine: ['QG15DE'],
    fits: ['sunny-n16'],
  },
  {
    brand: 'GATES', code: '5344XS',
    name: 'TIMING BELT GATES POWERGRIP TOYOTA 4A-FE / 7A-FE',
    category: 'engine-parts', make: 'TOYOTA', engine: ['4A-FE', '5A-FE'],
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: 'GATES', code: '6PK1195',
    name: 'V-RIBBED DRIVE BELT GATES MICRO-V 6PK1195 (6 RIB, 1195MM)',
    category: 'engine-parts', make: null,
  },

  // =========================================================================
  // BRAKE PARTS — pads, shoes, discs, cylinders
  // =========================================================================
  {
    brand: 'TOYOTA GENUINE', code: '04465-02220',
    name: 'BRAKE PAD SET FRONT TOYOTA COROLLA ZRE142',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '04465-26420',
    name: 'BRAKE PAD SET FRONT TOYOTA HIACE KDH200',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '04465-0K240',
    name: 'BRAKE PAD SET FRONT TOYOTA HILUX VIGO KUN25',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['hilux-kun25'],
  },
  {
    brand: 'AKEBONO', code: 'AN-634WK',
    name: 'BRAKE PAD SET FRONT AKEBONO TOYOTA COROLLA NZE121, AXIO NZE141',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121', 'axio-nze141'],
  },
  {
    brand: 'AKEBONO', code: 'AN-424WK',
    name: 'BRAKE PAD SET FRONT AKEBONO HONDA FIT GD1 / GE6',
    category: 'brake-parts', make: 'HONDA', position: 'FRONT',
    fits: ['fit-gd1', 'fit-ge6'],
  },
  {
    brand: 'NISSHINBO', code: 'PF-1249',
    name: 'BRAKE PAD SET FRONT NISSHINBO NISSAN SUNNY N16',
    category: 'brake-parts', make: 'NISSAN', position: 'FRONT',
    fits: ['sunny-n16'],
  },
  {
    brand: 'MK KASHIYAMA', code: 'D2130',
    name: 'BRAKE PAD SET FRONT MK KASHIYAMA SUZUKI WAGON R MH34S, ALTO HA36S',
    category: 'brake-parts', make: 'SUZUKI', position: 'FRONT',
    fits: ['wagonr-mh34s', 'alto-ha36s'],
  },
  {
    brand: 'MK KASHIYAMA', code: 'K2364',
    name: 'BRAKE SHOE SET REAR MK KASHIYAMA TOYOTA COROLLA AE100 / AE110',
    category: 'brake-parts', make: 'TOYOTA', position: 'REAR',
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '04495-0K120',
    name: 'BRAKE SHOE SET REAR TOYOTA HILUX VIGO KUN25',
    category: 'brake-parts', make: 'TOYOTA', position: 'REAR',
    fits: ['hilux-kun25'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '43512-02090',
    name: 'BRAKE DISC ROTOR FRONT TOYOTA COROLLA NZE121',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '43512-26030',
    name: 'BRAKE DISC ROTOR FRONT TOYOTA HIACE KDH200',
    category: 'brake-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'AISIN', code: 'WCT-025',
    name: 'WHEEL CYLINDER REAR TOYOTA COROLLA AE110 (AISIN)',
    category: 'brake-parts', make: 'TOYOTA', position: 'REAR',
    fits: ['corolla-ae110'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '47201-26480',
    name: 'BRAKE MASTER CYLINDER ASSY TOYOTA HIACE KDH200',
    category: 'brake-parts', make: 'TOYOTA',
    fits: ['hiace-kdh200'],
  },

  // =========================================================================
  // SUSPENSION PARTS — joints, links, bushes, bearings
  // =========================================================================
  {
    brand: '555', code: 'SB-3652',
    name: 'BALL JOINT LOWER 555 TOYOTA COROLLA AE100 / AE110',
    category: 'suspension-parts', make: 'TOYOTA', position: 'LOWER',
    fits: ['corolla-ae100', 'corolla-ae110'],
  },
  {
    brand: '555', code: 'SE-3821',
    name: 'TIE ROD END OUTER 555 TOYOTA COROLLA AE110',
    category: 'suspension-parts', make: 'TOYOTA', position: 'OUTER',
    fits: ['corolla-ae110'],
  },
  {
    brand: '555', code: 'SR-3820',
    name: 'RACK END (INNER TIE ROD) 555 TOYOTA COROLLA AE110',
    category: 'suspension-parts', make: 'TOYOTA', position: 'INNER',
    fits: ['corolla-ae110'],
  },
  {
    brand: '555', code: 'SL-3555',
    name: 'STABILIZER LINK FRONT 555 TOYOTA COROLLA NZE121',
    category: 'suspension-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121'],
  },
  {
    brand: '555', code: 'SB-1682',
    name: 'BALL JOINT LOWER 555 NISSAN SUNNY N16',
    category: 'suspension-parts', make: 'NISSAN', position: 'LOWER',
    fits: ['sunny-n16'],
  },
  {
    brand: '555', code: 'SE-1881',
    name: 'TIE ROD END OUTER 555 NISSAN SUNNY N16, MARCH K11',
    category: 'suspension-parts', make: 'NISSAN', position: 'OUTER',
    fits: ['sunny-n16', 'march-k11'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '48815-12100',
    name: 'STABILIZER BAR BUSH FRONT TOYOTA COROLLA NZE121',
    category: 'suspension-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '48654-12080',
    name: 'LOWER CONTROL ARM BUSH TOYOTA COROLLA AE110',
    category: 'suspension-parts', make: 'TOYOTA', position: 'LOWER',
    fits: ['corolla-ae110'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '48131-12750',
    name: 'COIL SPRING FRONT TOYOTA COROLLA AE110',
    category: 'suspension-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-ae110'],
  },
  {
    brand: 'KOYO', code: 'DAC3872W-1CS81',
    name: 'FRONT WHEEL HUB BEARING KOYO 38 X 72 X 33MM (DOUBLE ROW)',
    category: 'suspension-parts', make: null, position: 'FRONT',
  },
  {
    brand: 'NTN', code: 'DAC3055W-3CS31',
    name: 'FRONT WHEEL HUB BEARING NTN 30 X 55 X 32MM (DOUBLE ROW)',
    category: 'suspension-parts', make: null, position: 'FRONT',
  },
  {
    brand: 'KOYO', code: '6203-2RS',
    name: 'BALL BEARING KOYO 6203-2RS SEALED 17 X 40 X 12MM',
    category: 'suspension-parts', make: null,
  },

  // =========================================================================
  // SHOCK ABSORBERS — KYB, its own category in seed-categories.ts
  // =========================================================================
  {
    brand: 'KYB', code: '333224',
    name: 'SHOCK ABSORBER FRONT KYB EXCEL-G TOYOTA COROLLA AE110',
    category: 'shock-absorbers', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-ae110'],
  },
  {
    brand: 'KYB', code: '343372',
    name: 'SHOCK ABSORBER REAR KYB EXCEL-G TOYOTA COROLLA AE110',
    category: 'shock-absorbers', make: 'TOYOTA', position: 'REAR',
    fits: ['corolla-ae110'],
  },
  {
    brand: 'KYB', code: '333225',
    name: 'SHOCK ABSORBER FRONT KYB EXCEL-G TOYOTA COROLLA NZE121',
    category: 'shock-absorbers', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'KYB', code: '341340',
    name: 'SHOCK ABSORBER FRONT KYB EXCEL-G NISSAN SUNNY N16',
    category: 'shock-absorbers', make: 'NISSAN', position: 'FRONT',
    fits: ['sunny-n16'],
  },
  {
    brand: 'KYB', code: '343286',
    name: 'SHOCK ABSORBER REAR KYB EXCEL-G NISSAN SUNNY N16',
    category: 'shock-absorbers', make: 'NISSAN', position: 'REAR',
    fits: ['sunny-n16'],
  },
  {
    brand: 'KYB', code: '344459',
    name: 'SHOCK ABSORBER REAR KYB EXCEL-G TOYOTA HIACE KDH200',
    category: 'shock-absorbers', make: 'TOYOTA', position: 'REAR',
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'KYB', code: '341257',
    name: 'SHOCK ABSORBER FRONT KYB EXCEL-G HONDA FIT GD1',
    category: 'shock-absorbers', make: 'HONDA', position: 'FRONT',
    fits: ['fit-gd1'],
  },
  {
    brand: 'KYB', code: '443209',
    name: 'SHOCK ABSORBER REAR KYB PREMIUM SUZUKI WAGON R MH34S',
    category: 'shock-absorbers', make: 'SUZUKI', position: 'REAR',
    fits: ['wagonr-mh34s'],
  },

  // =========================================================================
  // GEARBOX PARTS — clutch, drive shaft, seals
  // =========================================================================
  {
    brand: 'TOYOTA GENUINE', code: '31250-26170',
    name: 'CLUTCH DISC TOYOTA HIACE KDH200 (2KD-FTV)',
    category: 'gearbox-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '31210-26170',
    name: 'CLUTCH COVER (PRESSURE PLATE) TOYOTA HIACE KDH200',
    category: 'gearbox-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '31230-26170',
    name: 'CLUTCH RELEASE BEARING TOYOTA HIACE KDH200',
    category: 'gearbox-parts', make: 'TOYOTA',
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '31470-26140',
    name: 'CLUTCH RELEASE CYLINDER TOYOTA HIACE KDH200',
    category: 'gearbox-parts', make: 'TOYOTA',
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'EXEDY', code: 'TYD062U',
    name: 'CLUTCH DISC EXEDY 200MM 20 TEETH TOYOTA COROLLA AE110',
    category: 'gearbox-parts', make: 'TOYOTA', engine: ['4A-FE'],
    fits: ['corolla-ae110'],
  },
  {
    brand: 'EXEDY', code: 'TYC546',
    name: 'CLUTCH COVER EXEDY 200MM TOYOTA COROLLA AE110',
    category: 'gearbox-parts', make: 'TOYOTA', engine: ['4A-FE'],
    fits: ['corolla-ae110'],
  },
  {
    brand: 'EXEDY', code: 'NSD027U',
    name: 'CLUTCH DISC EXEDY NISSAN SUNNY N16 (QG15DE)',
    category: 'gearbox-parts', make: 'NISSAN', engine: ['QG15DE'],
    fits: ['sunny-n16'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '04437-0K020',
    name: 'CV JOINT BOOT KIT OUTER TOYOTA HILUX VIGO KUN25',
    category: 'gearbox-parts', make: 'TOYOTA', position: 'OUTER',
    fits: ['hilux-kun25'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '43420-02290',
    name: 'FRONT DRIVE SHAFT ASSY RH TOYOTA COROLLA NZE121',
    category: 'gearbox-parts', make: 'TOYOTA', position: 'FRONT RH',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'NOK', code: '35X52X8',
    name: 'GEARBOX OIL SEAL NOK 35 X 52 X 8MM (TC TYPE, SOLD BY SIZE)',
    category: 'gearbox-parts', make: null,
  },

  // =========================================================================
  // ELECTRICAL PARTS — alternators, starters, coils, batteries
  // =========================================================================
  {
    brand: 'TOYOTA GENUINE', code: '27060-0D030',
    name: 'ALTERNATOR 12V 80A TOYOTA COROLLA NZE121',
    category: 'electrical-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '28100-0D030',
    name: 'STARTER MOTOR 12V 1.4KW TOYOTA COROLLA NZE121',
    category: 'electrical-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '90919-02240',
    name: 'IGNITION COIL TOYOTA 1NZ-FE COROLLA NZE121, AXIO NZE141',
    category: 'electrical-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121', 'axio-nze141'],
  },
  {
    brand: 'NISSAN GENUINE', code: '22448-6N015',
    name: 'IGNITION COIL NISSAN SUNNY N16 (QG15DE)',
    category: 'electrical-parts', make: 'NISSAN', engine: ['QG15DE'],
    fits: ['sunny-n16'],
  },
  {
    brand: 'NISSAN GENUINE', code: '23300-6N210',
    name: 'STARTER MOTOR 12V NISSAN SUNNY N16 (QG15DE)',
    category: 'electrical-parts', make: 'NISSAN', engine: ['QG15DE'],
    fits: ['sunny-n16'],
  },
  {
    brand: 'SUZUKI GENUINE', code: '31400-58M00',
    name: 'ALTERNATOR 12V 70A SUZUKI WAGON R MH34S (R06A)',
    category: 'electrical-parts', make: 'SUZUKI', engine: ['R06A'],
    fits: ['wagonr-mh34s'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '85110-0D010',
    name: 'WIPER MOTOR FRONT TOYOTA COROLLA NZE121',
    category: 'electrical-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '86510-0D010',
    name: 'HORN ASSY TOYOTA COROLLA NZE121',
    category: 'electrical-parts', make: 'TOYOTA',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '90987-02003',
    name: 'RELAY 4-PIN 12V TOYOTA (UNIVERSAL FITTING)',
    category: 'electrical-parts', make: 'TOYOTA',
  },
  {
    brand: 'AMARON', code: 'NS40ZL',
    name: 'BATTERY 12V 35AH JIS NS40ZL (LEFT TERMINAL) — SMALL CAR / KEI',
    category: 'electrical-parts', make: null,
  },
  {
    brand: 'AMARON', code: '55D23L',
    name: 'BATTERY 12V 60AH JIS 55D23L (LEFT TERMINAL) — VAN / PICKUP',
    category: 'electrical-parts', make: null,
  },
  {
    brand: 'EXIDE', code: 'NS60LS',
    name: 'BATTERY 12V 45AH JIS NS60LS (LEFT TERMINAL, SMALL POST)',
    category: 'electrical-parts', make: null,
  },

  // =========================================================================
  // LIGHTS & MIRRORS — bulbs are sold by fitting code, lamps by vehicle
  // =========================================================================
  {
    brand: 'OSRAM', code: '64193',
    name: 'HALOGEN BULB H4 12V 60/55W P43t OSRAM ORIGINAL',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'OSRAM', code: '64210',
    name: 'HALOGEN BULB H7 12V 55W PX26d OSRAM ORIGINAL',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'PHILIPS', code: '12342',
    name: 'HALOGEN BULB H4 12V 60/55W PHILIPS VISION',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'PHILIPS', code: '12972',
    name: 'HALOGEN BULB H7 12V 55W PHILIPS VISION',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'OSRAM', code: '2825',
    name: 'BULB W5W 12V 5W T10 WEDGE (PARKING / NUMBER PLATE)',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'OSRAM', code: '7506',
    name: 'BULB P21W 12V 21W BA15s SINGLE FILAMENT (INDICATOR / REVERSE)',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'TOYOTA GENUINE', code: '81130-02420',
    name: 'HEAD LAMP ASSY RH TOYOTA COROLLA ZRE142',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'RH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '81150-02420',
    name: 'HEAD LAMP ASSY LH TOYOTA COROLLA ZRE142',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'LH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '81551-02440',
    name: 'TAIL LAMP ASSY RH TOYOTA COROLLA ZRE142',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'RH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '81561-02440',
    name: 'TAIL LAMP ASSY LH TOYOTA COROLLA ZRE142',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'LH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '87910-0D420',
    name: 'OUTER REAR VIEW MIRROR ASSY RH TOYOTA COROLLA NZE121',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'RH',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '87940-0D420',
    name: 'OUTER REAR VIEW MIRROR ASSY LH TOYOTA COROLLA NZE121',
    category: 'lights-mirrors', make: 'TOYOTA', position: 'LH',
    fits: ['corolla-nze121'],
  },

  // =========================================================================
  // BODY PARTS — panels and trim
  // =========================================================================
  {
    brand: 'TOYOTA GENUINE', code: '52119-02970',
    name: 'FRONT BUMPER COVER TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '52159-02911',
    name: 'REAR BUMPER COVER TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'REAR',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '53111-02330',
    name: 'RADIATOR GRILLE TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '53301-02160',
    name: 'HOOD (BONNET) PANEL SUB-ASSY TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '53801-02330',
    name: 'FRONT FENDER PANEL RH TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT RH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '53802-02330',
    name: 'FRONT FENDER PANEL LH TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT LH',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '76621-02100',
    name: 'FRONT MUDGUARD / SPLASH SHIELD TOYOTA COROLLA ZRE142',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['corolla-zre142'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '69210-02090',
    name: 'OUTSIDE DOOR HANDLE FRONT RH TOYOTA COROLLA NZE121',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT RH',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '67001-02180',
    name: 'FRONT DOOR PANEL SUB-ASSY RH TOYOTA COROLLA NZE121',
    category: 'body-parts', make: 'TOYOTA', position: 'FRONT RH',
    fits: ['corolla-nze121'],
  },
  {
    brand: 'SUZUKI GENUINE', code: '71711-58M00',
    name: 'FRONT BUMPER COVER SUZUKI WAGON R MH34S',
    category: 'body-parts', make: 'SUZUKI', position: 'FRONT',
    fits: ['wagonr-mh34s'],
  },

  // =========================================================================
  // GAP FILLS
  //
  // Not a second thought — these came from running real customer phrasings
  // through `hybridPartSearch` after the first 93 rows were loaded, and
  // reading what came back. Retrieval was doing its job; the catalogue was
  // the problem. "oil filter for alto" returned an AIR filter, "clutch for a
  // canter" returned a Hiace clutch, "oil filter for mitsubishi lancer"
  // returned a Nissan one, and "radiator" / "wiper blade" returned nothing
  // relevant at all because neither existed in any category.
  //
  // That is the failure mode worth designing against: semantic search always
  // returns its nearest neighbour, so a missing part does not read as
  // "we don't stock that" — it reads as a confident wrong answer. The fix is
  // coverage of the things people actually walk in and ask for, which in Sri
  // Lanka means Suzuki and Mitsubishi small cars get the same depth Toyota
  // does, and the two highest-volume counter items (radiators, wipers) exist
  // at all.
  // =========================================================================

  // --- Mitsubishi, previously present only as GMB U-joints -----------------
  {
    brand: 'MITSUBISHI GENUINE', code: 'MD135737',
    name: 'OIL FILTER MITSUBISHI LANCER CK1 / CS3 (4G13, 4G15, 4G18)',
    category: 'engine-parts', make: 'MITSUBISHI', engine: ['4G13', '4G15', '4G18'],
    fits: ['lancer-ck1', 'lancer-cs3'],
  },
  {
    brand: 'MITSUBISHI GENUINE', code: 'MR205215',
    name: 'AIR FILTER MITSUBISHI LANCER CS3 (4G18)',
    category: 'engine-parts', make: 'MITSUBISHI', engine: ['4G18'],
    fits: ['lancer-cs3'],
  },
  {
    brand: 'NGK', code: 'BPR6ES',
    name: 'SPARK PLUG NGK BPR6ES NICKEL MITSUBISHI 4G13 / 4G15',
    category: 'engine-parts', make: 'MITSUBISHI', engine: ['4G13', '4G15'],
    fits: ['lancer-ck1'],
  },
  {
    brand: 'GATES', code: '5259XS',
    name: 'TIMING BELT GATES POWERGRIP MITSUBISHI 4G13 / 4G15',
    category: 'engine-parts', make: 'MITSUBISHI', engine: ['4G13', '4G15'],
    fits: ['lancer-ck1'],
  },
  {
    brand: 'MK KASHIYAMA', code: 'D5075',
    name: 'BRAKE PAD SET FRONT MK KASHIYAMA MITSUBISHI LANCER CK1 / CS3',
    category: 'brake-parts', make: 'MITSUBISHI', position: 'FRONT',
    fits: ['lancer-ck1', 'lancer-cs3'],
  },
  {
    brand: 'MITSUBISHI GENUINE', code: 'ME500171',
    name: 'CLUTCH DISC MITSUBISHI CANTER FE639 (4D34)',
    category: 'gearbox-parts', make: 'MITSUBISHI', engine: ['4D34'],
    fits: ['canter-fe639'],
  },
  {
    brand: 'MITSUBISHI GENUINE', code: 'MD184086',
    name: 'OIL FILTER MITSUBISHI L200 K74 (4D56 DIESEL)',
    category: 'engine-parts', make: 'MITSUBISHI', engine: ['4D56'],
    fits: ['l200-k74'],
  },

  // --- Suzuki: Alto and Wagon R are the highest-volume cars in the country -
  {
    brand: 'SUZUKI GENUINE', code: '16510-81420',
    name: 'OIL FILTER SUZUKI ALTO F8D / HA36S, WAGON R MH34S / MH44S, EVERY DA64V',
    category: 'engine-parts', make: 'SUZUKI', engine: ['F8D', 'R06A', 'K6A'],
    fits: ['alto-f8d', 'alto-ha36s', 'wagonr-mh34s', 'wagonr-mh44s', 'every-da64v'],
  },
  {
    brand: 'SUZUKI GENUINE', code: '53200-58M00',
    name: 'BRAKE SHOE SET REAR SUZUKI ALTO HA36S, WAGON R MH34S',
    category: 'brake-parts', make: 'SUZUKI', position: 'REAR',
    fits: ['alto-ha36s', 'wagonr-mh34s'],
  },
  {
    brand: 'SUZUKI GENUINE', code: '17700-58M00',
    name: 'RADIATOR ASSY SUZUKI WAGON R MH34S (R06A)',
    category: 'engine-parts', make: 'SUZUKI', engine: ['R06A'],
    fits: ['wagonr-mh34s'],
  },

  // --- Honda: had an oil filter and a shock, but no plug -------------------
  {
    brand: 'NGK', code: 'ZFR6F-11',
    name: 'SPARK PLUG NGK ZFR6F-11 HONDA FIT GD1 / GE6 (L13A), CIVIC FD1 (R18A)',
    category: 'engine-parts', make: 'HONDA', engine: ['L13A', 'R18A'],
    fits: ['fit-gd1', 'fit-ge6', 'civic-fd1'],
  },

  // --- Radiators and cooling: a top-three counter ask, previously absent ---
  {
    brand: 'TOYOTA GENUINE', code: '16400-0D190',
    name: 'RADIATOR ASSY TOYOTA COROLLA NZE121 (1NZ-FE)',
    category: 'engine-parts', make: 'TOYOTA', engine: ['1NZ-FE'],
    fits: ['corolla-nze121'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '16400-30150',
    name: 'RADIATOR ASSY TOYOTA HIACE KDH200 (2KD-FTV)',
    category: 'engine-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '16401-72090',
    name: 'RADIATOR CAP 1.1 BAR TOYOTA (COMMON FITTING)',
    category: 'engine-parts', make: 'TOYOTA',
  },

  // --- Wipers: sold by blade length, so no vehicle list ---------------------
  {
    brand: 'NWB', code: 'G48',
    name: 'WIPER BLADE NWB GRAPHITE 480MM (SOLD BY LENGTH)',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'NWB', code: 'G45',
    name: 'WIPER BLADE NWB GRAPHITE 450MM (SOLD BY LENGTH)',
    category: 'lights-mirrors', make: null,
  },
  {
    brand: 'NWB', code: 'G40',
    name: 'WIPER BLADE NWB GRAPHITE 400MM (SOLD BY LENGTH)',
    category: 'lights-mirrors', make: null,
  },

  // --- Filters the first batch missed --------------------------------------
  {
    brand: 'TOYOTA GENUINE', code: '23390-0L010',
    name: 'FUEL FILTER (DIESEL) TOYOTA HIACE KDH200, HILUX VIGO KUN25',
    category: 'engine-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200', 'hilux-kun25'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '87139-50060',
    name: 'CABIN AIR FILTER (A/C FILTER) TOYOTA COROLLA, AXIO, PRIUS',
    category: 'engine-parts', make: 'TOYOTA',
    fits: ['corolla-nze121', 'axio-nze141', 'prius-zvw30'],
  },

  // --- Hiace electrical: the van had no starter or alternator of its own ---
  {
    brand: 'TOYOTA GENUINE', code: '27060-30050',
    name: 'ALTERNATOR 12V 100A TOYOTA HIACE KDH200 (2KD-FTV)',
    category: 'electrical-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200'],
  },
  {
    brand: 'TOYOTA GENUINE', code: '28100-30050',
    name: 'STARTER MOTOR 12V 2.0KW TOYOTA HIACE KDH200 (2KD-FTV)',
    category: 'electrical-parts', make: 'TOYOTA', engine: ['2KD-FTV'],
    fits: ['hiace-kdh200'],
  },

  // --- Vitz had no suspension at all --------------------------------------
  {
    brand: 'KYB', code: '334200',
    name: 'SHOCK ABSORBER FRONT KYB EXCEL-G TOYOTA VITZ KSP90',
    category: 'shock-absorbers', make: 'TOYOTA', position: 'FRONT',
    fits: ['vitz-ksp90'],
  },
  {
    brand: '555', code: 'SL-3620',
    name: 'STABILIZER LINK FRONT 555 TOYOTA VITZ KSP90',
    category: 'suspension-parts', make: 'TOYOTA', position: 'FRONT',
    fits: ['vitz-ksp90'],
  },
];
