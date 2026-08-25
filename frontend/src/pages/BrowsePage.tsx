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
  UNVERIFIED: 'bg-chalk/50',
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
    'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-safety focus:ring-1 focus:ring-safety focus:outline-none transition-all';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-chalk/60';

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 bg-graphite text-white">
      <h1 className="font-display text-4xl font-bold tracking-tight">Browse Parts</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[280px_1fr]">
        <aside className="space-y-6">
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
              <option value="" className="bg-graphite text-white">All categories</option>
              {categoriesQuery.data?.map((c) => (
                <option key={c.id} value={c.slug} className="bg-graphite text-white">
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
              <option value="" className="bg-graphite text-white">All brands</option>
              {brandsQuery.data?.map((b) => (
                <option key={b.id} value={b.id} className="bg-graphite text-white">
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
              <option value="" className="bg-graphite text-white">Any make</option>
              {[...new Set((vehiclesQuery.data ?? []).map((v) => v.make))].sort().map((make) => (
                <option key={make} value={make} className="bg-graphite text-white">
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
              className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <option value="" className="bg-graphite text-white">Any model</option>
              {modelsForMake.map((model) => (
                <option key={model} value={model} className="bg-graphite text-white">
                  {model}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <main>
          {partsQuery.isLoading && <p className="text-chalk/60 animate-pulse">Loading catalogue...</p>}
          {partsQuery.isError && (
            <p className="text-red-400">Could not load parts. Is the backend running?</p>
          )}

          {partsQuery.data && (
            <>
              <p className="mb-4 text-sm font-medium text-safety">{partsQuery.data.total} parts found</p>

              <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl overflow-hidden">
                {partsQuery.data.parts.map((part) => (
                  <li key={part.id}>
                    <Link
                      to={`/parts/${part.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/10"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display font-bold text-white text-lg">{part.rawName}</p>
                        <p className="mt-1 flex items-center gap-3 text-sm text-chalk/70">
                          <span className="font-semibold text-chalk/90">{part.brand?.name ?? 'Unknown brand'}</span>
                          {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                          <span>{part.category.name}</span>
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-chalk/80">
                        <span
                          className={`h-2 w-2 rounded-full ${AVAILABILITY_DOT[part.availabilityStatus] ?? 'bg-chalk/50'}`}
                        />
                        {part.availabilityStatus.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {partsQuery.data.parts.length === 0 && (
                <p className="mt-8 text-center text-chalk/50 py-12 rounded-2xl border border-white/10 border-dashed">
                  No parts match these filters. Try adjusting your search criteria.
                </p>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="btn-premium disabled:opacity-30 disabled:pointer-events-none"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= partsQuery.data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="btn-premium disabled:opacity-30 disabled:pointer-events-none"
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
