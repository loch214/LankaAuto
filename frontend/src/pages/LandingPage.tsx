import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { PartTag } from '../components/PartTag';

/**
 * The customer-facing landing page — PLAN.md §8: hero, what the shop
 * stocks, brands carried. Contact/location/hours live in the footer
 * (`Layout.tsx`) so they're on every page, not just this one. Distinct
 * from `/browse`, which is the working search-and-filter tool this page
 * hands off to rather than duplicates.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const [heroQuery, setHeroQuery] = useState('');

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: api.listCategories });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: api.listBrands });
  const vehiclesQuery = useQuery({ queryKey: ['vehicles'], queryFn: api.listVehicles });

  const makeCount = new Set((vehiclesQuery.data ?? []).map((v) => v.make)).size;

  function submitHeroSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/browse${heroQuery.trim() ? `?q=${encodeURIComponent(heroQuery.trim())}` : ''}`);
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-graphite">
        <div className="hazard-stripe pointer-events-none absolute -right-24 -top-24 size-72 rotate-6 opacity-[0.07]" />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="font-mono text-sm tracking-widest text-safety">GMB CERTIFIED STOCK · SRI LANKA</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-chalk sm:text-7xl">
            PARTS THAT FIT.
            <br />
            PRICES THAT DON&rsquo;T HIDE.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Give us the part number off the box, or tell us the vehicle. We&rsquo;ll tell you exactly
            what fits — and say so plainly when a price list can&rsquo;t settle it alone.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/browse"
              className="rounded-sm bg-safety px-6 py-3 text-sm font-semibold text-graphite transition-colors hover:bg-signal"
            >
              Browse the catalogue
            </Link>
            <a
              href="tel:+94771234567"
              className="rounded-sm border border-chalk/25 px-6 py-3 text-sm font-semibold text-chalk transition-colors hover:border-safety hover:text-safety"
            >
              Call the counter
            </a>
          </div>

          <form onSubmit={submitHeroSearch} className="mt-10 flex max-w-lg gap-2">
            <input
              type="text"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              placeholder="Or search a part number — try “GUT12”"
              className="w-full rounded-sm border border-muted/40 bg-steel px-4 py-3 font-mono text-sm text-chalk placeholder:text-muted focus:border-safety focus:outline-none"
            />
            <button
              type="submit"
              className="whitespace-nowrap rounded-sm border border-muted/40 px-5 py-3 text-sm font-semibold text-chalk transition-colors hover:border-safety hover:text-safety"
            >
              Find it
            </button>
          </form>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-chalk/10 pt-8 text-sm text-muted">
            <span>
              <span className="font-display text-2xl text-chalk">
                {categoriesQuery.data?.length ?? '—'}
              </span>{' '}
              part categories
            </span>
            <span>
              <span className="font-display text-2xl text-chalk">{makeCount || '—'}</span> vehicle makes
              covered
            </span>
            <span className="flex items-center gap-2">
              <span className="font-display text-2xl text-chalk">e.g.</span>
              <PartTag>GUT12</PartTag>
            </span>
          </div>
        </div>
      </section>

      {/* What we stock — categories hung off a rail, like bins on a shop shelf */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Browse by category</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-graphite sm:text-4xl">
          What&rsquo;s on the shelf
        </h2>

        <div className="mt-10 border-t-4 border-steel">
          <div className="flex flex-wrap gap-x-8 gap-y-10 pt-1">
            {categoriesQuery.data?.map((category, i) => (
              <Link
                key={category.id}
                to={`/browse?categorySlug=${category.slug}`}
                className={`group flex flex-col items-start transition-transform duration-150 hover:rotate-0 hover:-translate-y-0.5 ${
                  i % 2 === 0 ? '-rotate-1' : 'rotate-1'
                }`}
              >
                <span className="h-4 w-px bg-muted/50" />
                <span className="rounded-sm border-l-2 border-safety bg-white px-4 py-3 shadow-sm">
                  <span className="block font-display text-xl font-bold leading-none text-graphite group-hover:text-safety">
                    {category.name}
                  </span>
                  <span className="mt-1.5 block font-mono text-[11px] tracking-wide text-muted">
                    View range →
                  </span>
                </span>
              </Link>
            ))}
            {categoriesQuery.data?.length === 0 && (
              <p className="pb-2 text-muted">Catalogue is being loaded — check back shortly.</p>
            )}
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="bg-steel/5">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Approved suppliers</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-graphite sm:text-4xl">
            Brands we carry
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {brandsQuery.data?.map((brand) => (
              <span
                key={brand.id}
                className="rounded-sm border border-muted/30 bg-white px-4 py-2 font-display text-lg font-bold text-graphite"
              >
                {brand.name}
                {brand.country && <span className="ml-2 text-xs font-sans font-normal text-muted">{brand.country}</span>}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
