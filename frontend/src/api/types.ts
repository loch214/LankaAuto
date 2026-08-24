// Mirrors the JSON shapes the backend actually returns (see
// backend/src/routes/*.ts), not the full Prisma models — only the fields
// the UI reads are typed, so a backend field this app never uses doesn't
// need a matching type here.

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface Brand {
  id: string;
  name: string;
  isOem: boolean;
  country: string | null;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  chassisCode: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

export type AvailabilityStatus = 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK' | 'UNVERIFIED';

export interface PartAttributes {
  make?: string | null;
  model?: string[];
  chassisCode?: string[];
  engine?: string[];
  body?: string[];
  fuel?: string[];
  [key: string]: unknown;
}

export interface Part {
  id: string;
  rawName: string;
  normalizedName: string;
  partNumber: string | null;
  attributes: PartAttributes;
  availabilityStatus: AvailabilityStatus;
  lastVerifiedAt: string | null;
  needsReview: boolean;
  brand: Brand | null;
  category: Category;
}

export interface PartFitment {
  id: string;
  confidence: number;
  vehicle: Vehicle;
}

export interface PartDetail extends Part {
  fitments: PartFitment[];
}

export interface PartListResponse {
  parts: Part[];
  total: number;
  limit: number;
  offset: number;
}
