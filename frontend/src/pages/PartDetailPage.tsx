import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PartTag } from '../components/PartTag';
import { SHOP, telHref } from '../shopInfo';

/**
 * Part detail page. Shows the raw name (source of truth — see the
 * `Part.rawName` schema comment), parsed attributes, and every vehicle
 * fitment. No "cross-referenced alternatives" section yet — PLAN.md §6/§8
 * has cross_references cut pending a data-source decision. No availability
 * status shown at all (PLAN.md §5/§7, revised 2026-08-26) — stock is a
 * staff-facing concern now; customers are pointed at the phone/visit
 * prompt below instead of a status badge.
 */
export function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const partQuery = useQuery({
    queryKey: ['part', id],
    queryFn: () => api.getPart(id!),
    enabled: id !== undefined,
  });

  if (partQuery.isLoading) {
    return <p className="mx-auto max-w-3xl px-4 py-10 text-muted">Loading…</p>;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-red-600">Part not found.</p>
        <Link to="/browse" className="mt-2 inline-block text-sm text-safety underline">
          Back to browse
        </Link>
      </div>
    );
  }

  const part = partQuery.data;
  const attributeEntries = Object.entries(part.attributes).filter(
    ([, value]) => value !== null && !(Array.isArray(value) && value.length === 0),
  );

  // Root has no light background of its own, unlike the staff pages — this
  // sits on the app shell's dark theme (Layout.tsx's bg-graphite), same as
  // BrowsePage, so text here is light-on-dark, not the staff pages' dark
  // card pattern.
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-white">
      <Link to="/browse" className="text-sm text-chalk/60 hover:text-safety">
        ← Back to browse
      </Link>

      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white">
        {part.rawName}
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-chalk/60">
        <span>{part.brand?.name ?? 'Unknown brand'}</span>
        {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
        <span>{part.category.name}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-muted/30 bg-white px-4 py-3 text-sm">
        <span className="text-graphite">Call or visit the shop to check stock on this part.</span>
        <a href={telHref(SHOP.phonePrimary)} className="font-semibold text-safety hover:text-signal">
          {SHOP.phonePrimary}
        </a>
        <Link to="/visit" className="font-semibold text-safety hover:text-signal">
          Get directions →
        </Link>
      </div>

      {attributeEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-chalk/60">
            Parsed attributes
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {attributeEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-chalk/60">{key}</dt>
                <dd className="text-white">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {part.fitments.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-chalk/60">
            Fits these vehicles
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-white">
            {part.fitments.map((fitment) => (
              <li key={fitment.id}>
                {fitment.vehicle.make} {fitment.vehicle.model}
                {fitment.vehicle.chassisCode ? ` (${fitment.vehicle.chassisCode})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
