import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Vehicle } from '../api/types';
import { PartTag } from '../components/PartTag';

const PAGE_SIZE = 20;

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
  // Phones only: the five filters collapse behind one button so results
  // are on the first screen. At md and up they're always shown as the
  // sidebar, and this flag is ignored.
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    // Keep showing the current list while the next one loads. Without this,
    // every keystroke in the search box blanked the list to "Loading..."
    // and back, which on a phone reads as the page flickering.
    placeholderData: keepPreviousData,
  });

  const activeFilterCount = [categorySlug, brandId, vehicleMake, vehicleModel].filter((v) => v !== '').length;

  function clearFilters() {
    setCategorySlug('');
    setBrandId('');
    setVehicleMake('');
    setVehicleModel('');
    resetToFirstPage();
  }

  function goToPage(nextOffset: number) {
    setOffset(nextOffset);
    // Next/Previous sit at the bottom of the list. Without this, on a phone
    // the new page loads but you're still looking at the bottom of it.
    window.scrollTo({ top: 0 });
  }

  function resetToFirstPage() {
    setOffset(0);
  }

  // text-base below sm: iPhone Safari zooms the page into any field
  // smaller than 16px when it's focused, and doesn't zoom back out.
  const inputClass =
    'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:border-safety focus:ring-1 focus:ring-safety focus:outline-none transition-all sm:text-sm';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-chalk/60';

  return (
    <div className="mx-auto max-w-7xl bg-graphite px-5 py-8 text-white sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Browse Parts</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:mt-8 md:grid-cols-[280px_1fr] md:gap-10">
        <aside className="space-y-4 md:space-y-6">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className={labelClass} htmlFor="q">
                Search
              </label>
              <input
                id="q"
                type="search"
                enterKeyHint="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  resetToFirstPage();
                }}
                placeholder="Name or part number"
                className={`${inputClass} font-mono`}
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="browse-filters"
              className={`pressable flex h-[50px] shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors md:hidden ${
                filtersOpen || activeFilterCount > 0
                  ? 'border-safety/60 bg-safety/10 text-white'
                  : 'border-white/10 bg-white/5 text-chalk/80'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
                <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-safety px-1.5 text-xs font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Phones: hidden until "Filters" is tapped, then a 2-column grid
              so all four fit in roughly one thumb's reach. md and up:
              always visible, one column, exactly as before. */}
          <div
            id="browse-filters"
            className={`${filtersOpen ? 'grid' : 'hidden'} grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:block md:space-y-6 md:rounded-none md:border-0 md:bg-transparent md:p-0`}
          >

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

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="col-span-2 justify-self-start text-sm font-semibold text-safety hover:text-signal"
            >
              Clear filters
            </button>
          )}
          </div>
        </aside>

        <main className="min-w-0">
          {partsQuery.isLoading && <p className="animate-pulse text-chalk/60">Loading catalogue...</p>}
          {partsQuery.isError && (
            <p className="text-red-400">Could not load parts. Is the backend running?</p>
          )}

          {partsQuery.data && (
            <>
              <p className="mb-3 text-sm font-medium text-chalk/60">
                <span className="text-safety">{partsQuery.data.total}</span> parts found
                {partsQuery.isFetching && <span className="ml-2 text-chalk/40">· updating…</span>}
              </p>

              <ul
                className={`divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl transition-opacity ${
                  partsQuery.isPlaceholderData ? 'opacity-60' : ''
                }`}
              >
                {partsQuery.data.parts.map((part) => (
                  <li key={part.id}>
                    <Link
                      to={`/parts/${part.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/10 active:bg-white/10 sm:px-6 sm:py-4"
                    >
                      <div className="min-w-0 flex-1">
                        {/* Two lines, then clip — part names are long and
                            the distinguishing bit (the vehicle) is at the
                            end, which a one-line truncate always cut off. */}
                        <p className="line-clamp-2 font-display text-base font-bold leading-snug text-white sm:text-lg">
                          {part.rawName}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-chalk/60 sm:text-sm">
                          {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                          <span className="font-semibold text-chalk/85">{part.brand?.name ?? 'Unknown brand'}</span>
                          <span aria-hidden="true" className="text-chalk/25">·</span>
                          <span>{part.category.name}</span>
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0 text-chalk/30" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>

              {partsQuery.data.parts.length === 0 && (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-chalk/60">
                  <p>No parts match these filters.</p>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-safety hover:text-signal">
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {partsQuery.data.total > PAGE_SIZE && (
                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => goToPage(Math.max(0, offset - PAGE_SIZE))}
                    className="pressable min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold text-chalk transition-colors hover:border-safety hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-chalk/50 sm:text-sm">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, partsQuery.data.total)} of {partsQuery.data.total}
                  </span>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= partsQuery.data.total}
                    onClick={() => goToPage(offset + PAGE_SIZE)}
                    className="pressable min-h-11 rounded-full bg-safety px-5 text-sm font-semibold text-white transition-colors hover:bg-[#ff6b36] disabled:pointer-events-none disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
