import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Vehicle } from '../api/types';
import { PartTag } from '../components/PartTag';

const PAGE_SIZE = 20;

const AVAILABILITY_DOT: Record<string, string> = {
  IN_STOCK: 'bg-emerald-500',
  LOW: 'bg-signal',
  OUT_OF_STOCK: 'bg-red-500',
  UNVERIFIED: 'bg-muted',
};

/**
 * The catalogue browse page: search box plus the three filters PLAN.md §8
 * calls out — category, brand, vehicle make/model.
 *
 * Reads `q` and `categorySlug` from the URL on load so the landing page's
 * hero search and category cards can hand off directly into a pre-filtered
 * result set, rather than landing here empty and making the customer
 * re-type what they already told the hero.
 */
export function BrowsePage() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [categorySlug, setCategorySlug] = useState(searchParams.get('categorySlug') ?? '');
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

  const inputClass =
    'mt-1 w-full rounded-sm border border-muted/40 bg-white px-3 py-2 text-sm text-graphite focus:border-safety focus:outline-none';
  const labelClass = 'block text-sm font-medium text-graphite';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Browse parts</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="q">
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
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="category">
              Category
            </label>
            <select
              id="category"
              value={categorySlug}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                resetToFirstPage();
              }}
              className={inputClass}
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
            <label className={labelClass} htmlFor="brand">
              Brand
            </label>
            <select
              id="brand"
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                resetToFirstPage();
              }}
              className={inputClass}
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
            <label className={labelClass} htmlFor="vehicleMake">
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
              className={inputClass}
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
            <label className={labelClass} htmlFor="vehicleModel">
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
              className={`${inputClass} disabled:bg-chalk disabled:text-muted`}
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
          {partsQuery.isLoading && <p className="text-muted">Loading…</p>}
          {partsQuery.isError && (
            <p className="text-red-600">Could not load parts. Is the backend running?</p>
          )}

          {partsQuery.data && (
            <>
              <p className="mb-3 text-sm text-muted">{partsQuery.data.total} parts found</p>

              <ul className="divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
                {partsQuery.data.parts.map((part) => (
                  <li key={part.id}>
                    <Link
                      to={`/parts/${part.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-chalk"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-graphite">{part.rawName}</p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                          <span>{part.brand?.name ?? 'Unknown brand'}</span>
                          {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                          <span>{part.category.name}</span>
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[part.availabilityStatus] ?? 'bg-muted'}`}
                        />
                        {part.availabilityStatus.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {partsQuery.data.parts.length === 0 && (
                <p className="mt-4 text-muted">No parts match these filters.</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= partsQuery.data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite disabled:opacity-40"
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
