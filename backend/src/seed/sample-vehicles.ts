/**
 * The vehicle fleet the sample catalogue is written against.
 *
 * These are real vehicles, chosen because they are what actually turns up at
 * a Sri Lankan parts counter — the small-Japanese-import fleet (Wagon R,
 * Alto, Vitz, Aqua, Fit), the taxi/hire staples (Sunny B13/N16, Corolla
 * AE110), the van standard (Hiace KDH200, Caravan E25) and the light trucks
 * (Canter, Elf, Dutro). Every make advertised on the landing page's brand
 * marquee (`frontend/src/pages/LandingPage.tsx` -> `VEHICLE_BRANDS`) has at
 * least one vehicle here, so the marquee stops promising coverage the
 * catalogue cannot deliver.
 *
 * Unlike the 32 vehicles the GMB U-joint ingest produced — which carry a
 * make and model only, because that is all the source price list printed —
 * these carry a chassis code, a year range and an engine code. Those are
 * load-bearing, not decoration:
 *
 *   - `chassisCode` is the field `checkFitment` compares against
 *     `Part.attributes.chassisCode` for its POSSIBLE verdict. With every
 *     vehicle's chassis code null (the state before this file existed) that
 *     branch could never fire at all.
 *   - in Sri Lanka the chassis code IS how a part gets asked for — "AE110",
 *     "KDH200", "MH34S" — far more often than the model year is.
 *
 * `identityKey` is `MAKE|MODEL|CHASSIS`, the 3-part form the schema comment
 * on `Vehicle.identityKey` documents. The GMB rows use the 2-part
 * `MAKE|MODEL` form, so nothing here collides with them: `TOYOTA|COROLLA`
 * (generic, from the price list) and `TOYOTA|COROLLA|AE110` (specific) are
 * deliberately different rows. A customer asking about "a Corolla"
 * therefore gets several `lookup_vehicle` hits and the agent has to ask
 * which one — that is the anti-guessing rule in `services/agent/tools.ts`
 * working as designed, not a duplicate-data bug.
 *
 * Make and model are UPPERCASE because `buildPartWhere`
 * (`services/part-search.ts`) filters the browse page with an exact
 * `equals` against an uppercased dropdown value. Lower-case here would make
 * every vehicle filter silently return nothing.
 */

export interface SampleVehicle {
  /** Stable key that parts reference in their `fits` list. Never stored. */
  readonly key: string;
  readonly make: string;
  readonly model: string;
  readonly chassisCode: string;
  readonly yearFrom: number;
  readonly yearTo: number | null;
  readonly engineType: string;
  readonly fuel: 'PETROL' | 'DIESEL' | 'HYBRID';
  readonly body: string;
}

export const SAMPLE_VEHICLES: readonly SampleVehicle[] = [
  // --- Toyota -------------------------------------------------------------
  { key: 'corolla-ae100', make: 'TOYOTA', model: 'COROLLA', chassisCode: 'AE100', yearFrom: 1991, yearTo: 1995, engineType: '5A-FE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'corolla-ae110', make: 'TOYOTA', model: 'COROLLA', chassisCode: 'AE110', yearFrom: 1995, yearTo: 2000, engineType: '4A-FE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'corolla-nze121', make: 'TOYOTA', model: 'COROLLA', chassisCode: 'NZE121', yearFrom: 2000, yearTo: 2006, engineType: '1NZ-FE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'corolla-zre142', make: 'TOYOTA', model: 'COROLLA', chassisCode: 'ZRE142', yearFrom: 2007, yearTo: 2013, engineType: '2ZR-FE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'axio-nze141', make: 'TOYOTA', model: 'AXIO', chassisCode: 'NZE141', yearFrom: 2006, yearTo: 2012, engineType: '1NZ-FE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'vitz-ksp90', make: 'TOYOTA', model: 'VITZ', chassisCode: 'KSP90', yearFrom: 2005, yearTo: 2010, engineType: '1KR-FE', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'aqua-nhp10', make: 'TOYOTA', model: 'AQUA', chassisCode: 'NHP10', yearFrom: 2011, yearTo: 2021, engineType: '1NZ-FXE', fuel: 'HYBRID', body: 'HATCHBACK' },
  { key: 'prius-zvw30', make: 'TOYOTA', model: 'PRIUS', chassisCode: 'ZVW30', yearFrom: 2009, yearTo: 2015, engineType: '2ZR-FXE', fuel: 'HYBRID', body: 'HATCHBACK' },
  { key: 'hiace-lh113', make: 'TOYOTA', model: 'HIACE', chassisCode: 'LH113', yearFrom: 1989, yearTo: 1998, engineType: '3L', fuel: 'DIESEL', body: 'VAN' },
  { key: 'hiace-kdh200', make: 'TOYOTA', model: 'HIACE', chassisCode: 'KDH200', yearFrom: 2004, yearTo: 2019, engineType: '2KD-FTV', fuel: 'DIESEL', body: 'VAN' },
  { key: 'hilux-kun25', make: 'TOYOTA', model: 'HILUX', chassisCode: 'KUN25', yearFrom: 2004, yearTo: 2015, engineType: '2KD-FTV', fuel: 'DIESEL', body: 'PICKUP' },

  // --- Nissan -------------------------------------------------------------
  { key: 'sunny-fb13', make: 'NISSAN', model: 'SUNNY', chassisCode: 'FB13', yearFrom: 1990, yearTo: 1994, engineType: 'GA15DE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'sunny-n16', make: 'NISSAN', model: 'SUNNY', chassisCode: 'N16', yearFrom: 2000, yearTo: 2006, engineType: 'QG15DE', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'march-k11', make: 'NISSAN', model: 'MARCH', chassisCode: 'K11', yearFrom: 1992, yearTo: 2002, engineType: 'CG10DE', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'march-k13', make: 'NISSAN', model: 'MARCH', chassisCode: 'K13', yearFrom: 2010, yearTo: 2022, engineType: 'HR12DE', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'caravan-e25', make: 'NISSAN', model: 'CARAVAN', chassisCode: 'E25', yearFrom: 2001, yearTo: 2012, engineType: 'ZD30DDTi', fuel: 'DIESEL', body: 'VAN' },

  // --- Mitsubishi ---------------------------------------------------------
  { key: 'lancer-ck1', make: 'MITSUBISHI', model: 'LANCER', chassisCode: 'CK1', yearFrom: 1996, yearTo: 2001, engineType: '4G13', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'lancer-cs3', make: 'MITSUBISHI', model: 'LANCER', chassisCode: 'CS3', yearFrom: 2003, yearTo: 2007, engineType: '4G18', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'l200-k74', make: 'MITSUBISHI', model: 'L200', chassisCode: 'K74', yearFrom: 1996, yearTo: 2007, engineType: '4D56', fuel: 'DIESEL', body: 'PICKUP' },
  { key: 'canter-fe639', make: 'MITSUBISHI', model: 'CANTER', chassisCode: 'FE639', yearFrom: 1993, yearTo: 2002, engineType: '4D34', fuel: 'DIESEL', body: 'TRUCK' },

  // --- Suzuki -------------------------------------------------------------
  { key: 'alto-f8d', make: 'SUZUKI', model: 'ALTO', chassisCode: 'F8D', yearFrom: 2000, yearTo: 2012, engineType: 'F8D', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'alto-ha36s', make: 'SUZUKI', model: 'ALTO', chassisCode: 'HA36S', yearFrom: 2014, yearTo: 2021, engineType: 'R06A', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'wagonr-mh34s', make: 'SUZUKI', model: 'WAGON R', chassisCode: 'MH34S', yearFrom: 2012, yearTo: 2017, engineType: 'R06A', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'wagonr-mh44s', make: 'SUZUKI', model: 'WAGON R', chassisCode: 'MH44S', yearFrom: 2014, yearTo: 2017, engineType: 'R06A', fuel: 'HYBRID', body: 'HATCHBACK' },
  { key: 'swift-zc71s', make: 'SUZUKI', model: 'SWIFT', chassisCode: 'ZC71S', yearFrom: 2007, yearTo: 2010, engineType: 'K12B', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'every-da64v', make: 'SUZUKI', model: 'EVERY', chassisCode: 'DA64V', yearFrom: 2005, yearTo: 2015, engineType: 'K6A', fuel: 'PETROL', body: 'VAN' },

  // --- Honda --------------------------------------------------------------
  { key: 'fit-gd1', make: 'HONDA', model: 'FIT', chassisCode: 'GD1', yearFrom: 2001, yearTo: 2007, engineType: 'L13A', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'fit-ge6', make: 'HONDA', model: 'FIT', chassisCode: 'GE6', yearFrom: 2007, yearTo: 2013, engineType: 'L13A', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'civic-fd1', make: 'HONDA', model: 'CIVIC', chassisCode: 'FD1', yearFrom: 2006, yearTo: 2011, engineType: 'R18A', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'vezel-ru3', make: 'HONDA', model: 'VEZEL', chassisCode: 'RU3', yearFrom: 2013, yearTo: 2021, engineType: 'LEB', fuel: 'HYBRID', body: 'SUV' },

  // --- Daihatsu -----------------------------------------------------------
  { key: 'mira-l275', make: 'DAIHATSU', model: 'MIRA', chassisCode: 'L275', yearFrom: 2006, yearTo: 2018, engineType: 'KF-VE', fuel: 'PETROL', body: 'HATCHBACK' },
  { key: 'hijet-s200p', make: 'DAIHATSU', model: 'HIJET', chassisCode: 'S200P', yearFrom: 1999, yearTo: 2007, engineType: 'EF-VE', fuel: 'PETROL', body: 'TRUCK' },

  // --- Isuzu / Hino / Hyundai / Mazda -------------------------------------
  { key: 'elf-nkr', make: 'ISUZU', model: 'ELF', chassisCode: 'NKR', yearFrom: 1993, yearTo: 2004, engineType: '4JB1', fuel: 'DIESEL', body: 'TRUCK' },
  { key: 'dutro-xzu', make: 'HINO', model: 'DUTRO', chassisCode: 'XZU', yearFrom: 1999, yearTo: null, engineType: 'N04C', fuel: 'DIESEL', body: 'TRUCK' },
  { key: 'accent-lc', make: 'HYUNDAI', model: 'ACCENT', chassisCode: 'LC', yearFrom: 2000, yearTo: 2005, engineType: 'G4EC', fuel: 'PETROL', body: 'SEDAN' },
  { key: 'familia-bj', make: 'MAZDA', model: 'FAMILIA', chassisCode: 'BJ', yearFrom: 1998, yearTo: 2003, engineType: 'ZL-DE', fuel: 'PETROL', body: 'HATCHBACK' },
];

export const VEHICLES_BY_KEY: ReadonlyMap<string, SampleVehicle> = new Map(
  SAMPLE_VEHICLES.map((v) => [v.key, v]),
);

/** `MAKE|MODEL|CHASSIS` — the 3-part form, so it can never collide with the GMB rows' 2-part keys. */
export function vehicleIdentityKey(v: SampleVehicle): string {
  return `${v.make}|${v.model}|${v.chassisCode}`.toUpperCase();
}
