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
  location: string | null;
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

/** Which tier of `GET /parts/search` produced a hit — see `hybrid-part-search.ts`. */
export type SearchMatchType = 'exact-number' | 'fuzzy-number' | 'semantic';

// --- Chat (Phase 5) ---------------------------------------------------------

export interface ChatCitation {
  partId: string;
  partNumber: string | null;
  rawName: string;
}

export interface ChatTurnRequest {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatTurnResponse {
  reply: string;
  citations: ChatCitation[];
}

export interface SearchHit {
  partId: string;
  partNumber: string | null;
  rawName: string;
  brandName: string | null;
  categoryName: string;
  availabilityStatus: AvailabilityStatus;
  location: string | null;
  matchType: SearchMatchType;
}

// --- Staff accounts (admin-only) --------------------------------------------

export interface StaffAccount {
  id: string;
  username: string;
  name: string;
  role: 'STAFF' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
}

export interface CreateStaffAccountInput {
  username: string;
  name: string;
  password: string;
  role?: 'STAFF' | 'ADMIN';
}

export interface UpdateStaffAccountInput {
  name?: string;
  password?: string;
  role?: 'STAFF' | 'ADMIN';
  isActive?: boolean;
}

// --- Bulk availability updates ----------------------------------------------

export interface BulkAvailabilityParams {
  q?: string;
  categorySlug?: string;
  brandId?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  status: AvailabilityStatus;
  dryRun: boolean;
}

export interface BulkAvailabilityResult {
  matched: number;
  willChange?: number;
  updated?: number;
}

// --- Admin reports -----------------------------------------------------------

export interface StockSummaryReport {
  overall: Partial<Record<AvailabilityStatus, number>>;
  byCategory: {
    categoryId: string;
    categoryName: string;
    counts: Partial<Record<AvailabilityStatus, number>>;
  }[];
}

export interface StalePart {
  id: string;
  rawName: string;
  partNumber: string | null;
  availabilityStatus: AvailabilityStatus;
  lastVerifiedAt: string | null;
  categoryName: string;
}

export interface StaleParts {
  parts: StalePart[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivityEntry {
  id: string;
  createdAt: string;
  oldStatus: AvailabilityStatus | null;
  newStatus: AvailabilityStatus;
  partId: string;
  partNumber: string | null;
  rawName: string;
  userName: string | null;
  username: string | null;
}

export interface ActivityLog {
  entries: ActivityEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface OutOfStockPart {
  id: string;
  rawName: string;
  partNumber: string | null;
  lastVerifiedAt: string | null;
  location: string | null;
  category: { name: string };
  brand: { name: string } | null;
}

export interface OutOfStockParts {
  parts: OutOfStockPart[];
  total: number;
  limit: number;
  offset: number;
}
