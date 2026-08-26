import type {
  ApproveCleanResult,
  ApproveRowResult,
  AvailabilityStatus,
  Brand,
  BulkAvailabilityParams,
  BulkAvailabilityResult,
  Category,
  ChatTurnRequest,
  ChatTurnResponse,
  CreateBrandInput,
  CreateCategoryInput,
  CreateStaffAccountInput,
  EditPartInput,
  IngestionImportResult,
  IngestionMapping,
  IngestionPreview,
  IngestionRun,
  PartDetail,
  PartListResponse,
  SearchHit,
  StaffAccount,
  StagingRow,
  StockSummaryReport,
  StaleParts,
  ActivityLog,
  OutOfStockParts,
  UpdateStaffAccountInput,
  Vehicle,
} from './types';

// Vite exposes only VITE_-prefixed env vars to client code — anything else
// in .env is invisible here by design, so a backend secret can't leak into
// the bundle through a naming accident.
const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return body !== null && typeof body === 'object' && 'error' in body
    ? String((body as { error: unknown }).error)
    : res.statusText;
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(path, API_BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json() as Promise<T>;
}

async function authedRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(new URL(path, API_BASE_URL), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json() as Promise<T>;
}

/** Multipart upload (the ingestion file), auth'd — no `Content-Type` header, so the browser sets its own multipart boundary. */
async function authedUpload<T>(path: string, token: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(new URL(path, API_BASE_URL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
  return res.json() as Promise<T>;
}

export interface PartListParams {
  q?: string;
  categorySlug?: string;
  brandId?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  limit?: number;
  offset?: number;
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: 'STAFF' | 'ADMIN';
}

export const api = {
  listParts: (params: PartListParams) =>
    get<PartListResponse>('/parts', params as Record<string, string | number | undefined>),
  getPart: (id: string) => get<PartDetail>(`/parts/${id}`),
  // Hybrid search (PLAN.md §10 Phase 3) — exact/fuzzy part number, falling
  // back to semantic description search. Distinct from `listParts`: this is
  // "I don't know what filters to pick, I just have a number or a
  // description," used by the staff fast-search screen. Staff/admin only —
  // results carry the folder/record physical-price-list citation.
  searchParts: (token: string, q: string, limit = 10) =>
    authedRequest<{ hits: SearchHit[] }>('GET', `/parts/search?q=${encodeURIComponent(q)}&limit=${limit}`, token).then(
      (r) => r.hits,
    ),
  // Phase 5 customer chat agent (PLAN.md §10) — stateless on the server, so
  // every call sends the full conversation so far, including the new user
  // message at the end. See `routes/chat.ts`.
  chat: (messages: ChatTurnRequest[]) => post<ChatTurnResponse>('/chat', { messages }),
  listCategories: () => get<{ categories: Category[] }>('/categories').then((r) => r.categories),
  listBrands: () => get<{ brands: Brand[] }>('/brands').then((r) => r.brands),
  listVehicles: () => get<{ vehicles: Vehicle[] }>('/vehicles').then((r) => r.vehicles),

  login: (username: string, password: string) =>
    fetch(new URL('/auth/login', API_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
      return res.json() as Promise<{ token: string; user: StaffUser }>;
    }),
  me: (token: string) =>
    fetch(new URL('/auth/me', API_BASE_URL), { headers: { Authorization: `Bearer ${token}` } }).then(
      async (res) => {
        if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
        return res.json() as Promise<StaffUser>;
      },
    ),
  updateAvailability: (token: string, partId: string, status: AvailabilityStatus) =>
    authedRequest<PartDetail>('PATCH', `/parts/${partId}/availability`, token, { status }),
  bulkUpdateAvailability: (token: string, params: BulkAvailabilityParams) =>
    authedRequest<BulkAvailabilityResult>('POST', '/parts/bulk-availability', token, params),

  // Admin-only account management (backend: routes/users.ts).
  listStaffAccounts: (token: string) =>
    authedRequest<{ users: StaffAccount[] }>('GET', '/users', token).then((r) => r.users),
  createStaffAccount: (token: string, input: CreateStaffAccountInput) =>
    authedRequest<StaffAccount>('POST', '/users', token, input),
  updateStaffAccount: (token: string, id: string, input: UpdateStaffAccountInput) =>
    authedRequest<StaffAccount>('PATCH', `/users/${id}`, token, input),
  deleteStaffAccount: (token: string, id: string) =>
    authedRequest<{ id: string }>('DELETE', `/users/${id}`, token),

  // Admin-only reports (backend: routes/reports.ts).
  getStockSummary: (token: string) => authedRequest<StockSummaryReport>('GET', '/reports/stock-summary', token),
  getStaleParts: (token: string, limit = 50, offset = 0) =>
    authedRequest<StaleParts>('GET', `/reports/stale-parts?limit=${limit}&offset=${offset}`, token),
  getActivityLog: (token: string, limit = 50, offset = 0) =>
    authedRequest<ActivityLog>('GET', `/reports/activity?limit=${limit}&offset=${offset}`, token),
  getOutOfStock: (token: string, limit = 50, offset = 0) =>
    authedRequest<OutOfStockParts>('GET', `/reports/out-of-stock?limit=${limit}&offset=${offset}`, token),

  // Catalogue CRUD (staff/admin — backend: routes/parts.ts, categories.ts, brands.ts).
  editPart: (token: string, id: string, input: EditPartInput) =>
    authedRequest<PartDetail>('PATCH', `/parts/${id}`, token, input),
  deletePart: (token: string, id: string) => authedRequest<{ id: string }>('DELETE', `/parts/${id}`, token),
  createCategory: (token: string, input: CreateCategoryInput) =>
    authedRequest<Category>('POST', '/categories', token, input),
  updateCategory: (token: string, id: string, input: Partial<CreateCategoryInput>) =>
    authedRequest<Category>('PATCH', `/categories/${id}`, token, input),
  createBrand: (token: string, input: CreateBrandInput) => authedRequest<Brand>('POST', '/brands', token, input),
  updateBrand: (token: string, id: string, input: Partial<CreateBrandInput>) =>
    authedRequest<Brand>('PATCH', `/brands/${id}`, token, input),

  // Price-list ingestion (staff/admin — backend: routes/ingestion.ts).
  previewIngestion: (token: string, file: File) => authedUpload<IngestionPreview>('/ingestion/preview', token, file),
  importIngestion: (
    token: string,
    input: { sourceFile: string; folderLabel?: string; mapping: IngestionMapping; rows: Record<string, string>[] },
  ) => authedRequest<IngestionImportResult>('POST', '/ingestion/import', token, input),
  listIngestionRuns: (token: string) =>
    authedRequest<{ runs: IngestionRun[] }>('GET', '/ingestion/runs', token).then((r) => r.runs),
  listStagingRows: (token: string, runId: string, pending = true) =>
    authedRequest<{ rows: StagingRow[] }>('GET', `/ingestion/runs/${runId}/rows?pending=${pending}`, token).then(
      (r) => r.rows,
    ),
  patchStagingRow: (
    token: string,
    rowId: string,
    input: {
      rawName?: string;
      partNumber?: string | null;
      recordNumber?: string | null;
      categoryId?: string;
      newCategoryName?: string;
      brandId?: string | null;
      newBrandName?: string;
    },
  ) => authedRequest<StagingRow>('PATCH', `/ingestion/rows/${rowId}`, token, input),
  approveStagingRow: (token: string, rowId: string) =>
    authedRequest<ApproveRowResult>('POST', `/ingestion/rows/${rowId}/approve`, token),
  rejectStagingRow: (token: string, rowId: string, reason?: string) =>
    authedRequest<StagingRow>('POST', `/ingestion/rows/${rowId}/reject`, token, { reason }),
  approveCleanRows: (token: string, runId: string) =>
    authedRequest<ApproveCleanResult>('POST', `/ingestion/runs/${runId}/approve-clean`, token),
};
