import type { Brand, Category, PartDetail, PartListResponse, Vehicle } from './types';

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

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new ApiError(res.status, message);
  }
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

export const api = {
  listParts: (params: PartListParams) =>
    get<PartListResponse>('/parts', params as Record<string, string | number | undefined>),
  getPart: (id: string) => get<PartDetail>(`/parts/${id}`),
  listCategories: () => get<{ categories: Category[] }>('/categories').then((r) => r.categories),
  listBrands: () => get<{ brands: Brand[] }>('/brands').then((r) => r.brands),
  listVehicles: () => get<{ vehicles: Vehicle[] }>('/vehicles').then((r) => r.vehicles),
};
