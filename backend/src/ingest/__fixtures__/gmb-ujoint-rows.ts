/**
 * All 62 rows of the GMB U-Joint price list, verbatim.
 *
 * Source: `GMB U JOINT-5.pdf`, GMB-U/JOINT-JAPAN, dated 2024-07-26.
 * Profile: `backend/docs/01-source-profile-gmb-ujoint.md`
 *
 * `make: null` is real data, not a gap in transcription — `GU 1638` has an
 * empty make cell. It is the reason the ingester reads table CELLS rather
 * than the flattened text line: flattened, that row reads
 * `GU 1638 STEERING JOINT 3,020.00` and a positional split assigns
 * `STEERING` as the make. Docs §2.
 *
 * `fitment` is columns 3..n-1 already concatenated. Column 4 of the source is
 * a layout artifact, populated in exactly one row (`GUT 21`), not a field.
 * Docs §2.
 *
 * Prices are the printed LIST price. A 25% discount applies at the file
 * level and is deliberately NOT baked in here. Docs §10.
 */
export interface GmbRow {
  readonly code: string;
  readonly make: string | null;
  readonly fitment: string;
  readonly price: string;
}

export const GMB_UJOINT_ROWS: readonly GmbRow[] = [
  { code: 'GUT11', make: 'TOYOTA', fitment: 'COROLLA', price: '2,460.00' },
  { code: 'GUT 12', make: 'TOYOTA', fitment: 'HIACE', price: '3,290.00' },
  { code: 'GUT 13', make: 'TOYOTA', fitment: 'CORONA/CARINA', price: '3,320.00' },
  { code: 'GUT 15', make: 'TOYOTA', fitment: 'DYNA', price: '8,120.00' },
  { code: 'GUT 17', make: 'TOYOTA', fitment: 'CAB', price: '4,120.00' },
  { code: 'GUT 20', make: 'TOYOTA', fitment: 'DYNA COASTER', price: '5,660.00' },
  // Column 4 ('CAB') concatenated — the one row that uses the spill cell.
  { code: 'GUT 21', make: 'TOYOTA', fitment: 'HIACE,LH113 CAB', price: '4,120.00' },
  { code: 'GUT 23', make: 'TOYOTA', fitment: 'LH113', price: '4,290.00' },
  { code: 'GUT 24', make: 'TOYOTA', fitment: 'T/ACE,L/ACE', price: '4,420.00' },
  { code: 'GUT 27', make: 'TOYOTA', fitment: 'HI-LUC,LN85 4WD', price: '5,590.00' },
  { code: 'GUT 28', make: 'TOYOTA', fitment: 'DYNA 15B/SO5C/JO5C', price: '8,960.00' },
  { code: 'GUT 29', make: 'TOYOTA', fitment: 'HI-LUX,VIGO', price: '5,030.00' },
  { code: 'GU 2200', make: 'TOYOTA', fitment: 'DYNA', price: '4,640.00' },

  { code: 'GUN 32', make: 'NISSAN', fitment: 'UD', price: '8,430.00' },
  { code: 'GUN 34', make: 'NISSAN', fitment: 'ED30 CIVILIAN', price: '4,530.00' },
  { code: 'GUN 45', make: 'NISSAN', fitment: 'SUNNY B210/B310', price: '4,260.00' },
  { code: 'GUN 46', make: 'NISSAN', fitment: 'D21 NEW', price: '3,970.00' },
  { code: 'GUN 27', make: 'NISSAN', fitment: 'CARAVAN', price: '3,040.00' },
  // Same fitment as GUN 45, different part, 30% cheaper. Docs §9.
  { code: 'GUN 28', make: 'NISSAN', fitment: 'SUNNY B210/B310', price: '2,995.00' },
  { code: 'GUN 29', make: 'NISSAN', fitment: 'D/CAB 4WD', price: '3,990.00' },
  { code: 'GUN 31', make: 'NISSAN', fitment: 'ATLAS', price: '9,030.00' },
  { code: 'GUN 50', make: 'NISSAN', fitment: 'NAVARA', price: '6,170.00' },

  { code: 'GUM 75', make: 'MITSUBISHI', fitment: 'CANTER,ROSA', price: '7,070.00' },
  { code: 'GUM 79', make: 'MITSUBISHI', fitment: 'DELICA', price: '3,120.00' },
  { code: 'GUM 81', make: 'MITSUBISHI', fitment: 'L300', price: '3,130.00' },
  { code: 'GUM 82', make: 'MITSUBISHI', fitment: 'FUSO TRUCK', price: '11,870.00' },
  { code: 'GUM 88', make: 'MITSUBISHI', fitment: 'PAJERO', price: '4,530.00' },
  { code: 'GUM 91', make: 'MITSUBISHI', fitment: 'L300 DIESEL,PAJERO', price: '4,870.00' },
  { code: 'GUM 92', make: 'MITSUBISHI', fitment: 'MINICAB U61', price: '3,740.00' },
  // GUMZ prefix, but MITSUBISHI — the prefix is a weak hint, not truth. Docs §8.
  { code: 'GUMZ 1', make: 'MITSUBISHI', fitment: 'LANCER', price: '2,930.00' },
  { code: 'GUM 85', make: 'MITSUBISHI', fitment: 'LANCER BOX', price: '4,390.00' },
  { code: 'GUM 87', make: 'MITSUBISHI', fitment: 'CANTER,ROSA', price: '5,460.00' },
  { code: 'GUM 93', make: 'MITSUBISHI', fitment: 'CANTER,ROSA', price: '5,420.00' },
  { code: 'GUM 99', make: 'MITSUBISHI', fitment: '4M40/INTECOOLER', price: '6,920.00' },
  { code: 'GU 1000 HD', make: 'MITSUBISHI', fitment: 'JEEP', price: '3,345.00' },

  { code: 'GUIS 52', make: 'ISUZU', fitment: 'ELF250', price: '4,210.00' },
  { code: 'GUIS 54', make: 'ISUZU', fitment: 'DA120', price: '7,860.00' },
  { code: 'GUIS 55', make: 'ISUZU', fitment: 'JCR', price: '11,395.00' },
  { code: 'GUIS 57', make: 'ISUZU', fitment: 'TRUCK', price: '18,390.00' },
  { code: 'GUIS 58', make: 'ISUZU', fitment: 'TXD LORRY', price: '5,980.00' },
  { code: 'GUIS 59', make: 'ISUZU', fitment: 'LORRY', price: '4,220.00' },
  { code: 'GUIS 62', make: 'ISUZU', fitment: 'DA120', price: '8,290.00' },
  { code: 'GUIS 64', make: 'ISUZU', fitment: 'TXD LORRY', price: '11,890.00' },
  { code: 'GUIS 66', make: 'ISUZU', fitment: 'ELF,NKR', price: '6,890.00' },
  { code: 'GUIS 67', make: 'ISUZU', fitment: 'LORRY/TIPER', price: '27,890.00' },
  { code: 'GUIS 70', make: 'ISUZU', fitment: 'TROOFER V6', price: '4,520.00' },
  { code: 'GUIS 73', make: 'ISUZU', fitment: '4HL1', price: '8,390.00' },
  { code: 'GU 500', make: 'ISUZU', fitment: 'ELF150', price: '2,790.00' },
  { code: 'GU 2000', make: 'ISUZU', fitment: 'BMC LORRY', price: '4,965.00' },

  { code: 'GU 1100', make: 'AUSTIN', fitment: 'LD VAN', price: '3,140.00' },
  { code: 'GU 7280/4', make: 'MAZDA', fitment: 'BONGO', price: '6,090.00' },
  { code: 'GUMZ 9', make: 'MAZDA', fitment: 'BONGO,R2,RF 929', price: '4,490.00' },
  { code: 'GUMZ 12', make: 'MAZDA', fitment: 'TRUCK,B2200 TM TF', price: '6,120.00' },
  { code: 'GUD 84', make: 'DAIHATSU', fitment: 'JEEP', price: '4,960.00' },
  // Double space before SL is in the source.
  { code: 'GUMZ 3', make: 'MAZDA', fitment: 'TRUCK  SL,TF,TM', price: '6,820.00' },

  { code: 'GUKO4', make: 'KOMATSU', fitment: 'D30', price: '16,495.00' },
  { code: 'GUKO5', make: 'KOMATSU', fitment: 'D30', price: '16,140.00' },
  { code: 'GUKO6', make: 'KOMATSU', fitment: 'D30', price: '15,740.00' },
  { code: 'GUKO 12', make: 'KOMATSU', fitment: 'D30', price: '29,290.00' },

  // Steering joints, in a file titled U/JOINT. Docs §3.
  { code: 'GU 1538', make: 'MITSUBISHI', fitment: 'STEERING JOINT', price: '3,020.00' },
  { code: 'GU 1638', make: null, fitment: 'STEERING JOINT', price: '3,020.00' },
  { code: 'GU 1948', make: 'ISUZU', fitment: 'STEERING JOINT', price: '4,840.00' },
];
