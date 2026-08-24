import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Vehicle } from '../api/types';

const PAGE_SIZE = 20;

/**
 * The catalogue browse page: search box plus the three filters PLAN.md §8
 * calls out — category, brand, vehicle make/model. Deliberately not a
 * landing page (hero, opening hours, etc.) — that's Phase 9 polish; this is
 * Phase 2's "public browse pages with filtering".
 */
export function BrowsePage() {
  const [q, setQ] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [brandId, setBrandId] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [offset, setOffset] = useState(0);

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: api.listCategories });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: api.listBrands });
  const vehiclesQuery = useQuery({ queryKey: ['vehicles'], queryFn: api.listVehicles });

  // Models are scoped to the selected make client-side — /vehicles returns
  // everything, and 32 rows is small enough that a second endpoint just to
  // filter server-side would be solving a problem this dataset doesn't have.
  const modelsForMake = useMemo(() => {
    const vehicles = vehiclesQuery.data ?? [];
    const scoped = vehicleMake === '' ? vehicles : vehicles.filter((v) => v.make === vehicleMake);
    return [...new Set(scoped.map((v: Vehicle) => v.model))].sort();
  }, [vehiclesQuery.data, vehicleMake]);

  const partsQuery = useQuery({
    queryKey: ['parts', { q, categorySlug, brandId, vehicleMake, vehicleModel, offset }],
    queryFn: () =>
      api.listParts({
        q: q || undefined,
        categorySlug: categorySlug || undefined,
        brandId: brandId || undefined,
        vehicleMake: vehicleMake || undefined,
        vehicleModel: vehicleModel || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  function resetToFirstPage() {
    setOffset(0);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Browse parts</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetToFirstPage();
              }}
              placeholder="Name or part number"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              value={categorySlug}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                resetToFirstPage();
              }}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categoriesQuery.data?.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="brand">
              Brand
            </label>
            <select
              id="brand"
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                resetToFirstPage();
              }}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All brands</option>
              {brandsQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="vehicleMake">
              Vehicle make
            </label>
            <select
              id="vehicleMake"
              value={vehicleMake}
              onChange={(e) => {
                setVehicleMake(e.target.value);
                setVehicleModel('');
                resetToFirstPage();
              }}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Any make</option>
              {[...new Set((vehiclesQuery.data ?? []).map((v) => v.make))].sort().map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="vehicleModel">
              Vehicle model
            </label>
            <select
              id="vehicleModel"
              value={vehicleModel}
              onChange={(e) => {
                setVehicleModel(e.target.value);
                resetToFirstPage();
              }}
              disabled={vehicleMake === ''}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Any model</option>
              {modelsForMake.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <main>
          {partsQuery.isLoading && <p className="text-slate-500">Loading…</p>}
          {partsQuery.isError && (
            <p className="text-red-600">Could not load parts. Is the backend running?</p>
          )}

          {partsQuery.data && (
            <>
              <p className="mb-3 text-sm text-slate-500">{partsQuery.data.total} parts found</p>

              <ul className="divide-y divide-slate-200 rounded border border-slate-200">
                {partsQuery.data.parts.map((part) => (
                  <li key={part.id}>
                    <Link
                      to={`/parts/${part.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{part.rawName}</p>
                        <p className="text-sm text-slate-500">
                          {part.brand?.name ?? 'Unknown brand'} · {part.partNumber ?? 'no code'} ·{' '}
                          {part.category.name}
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-wide text-slate-400">
                        {part.availabilityStatus.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {partsQuery.data.parts.length === 0 && (
                <p className="mt-4 text-slate-500">No parts match these filters.</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= partsQuery.data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
