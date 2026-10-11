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
// Customer-facing names for the parser's attribute keys. Keys missing here
// still show, just de-camelCased ("someKey" → "Some key") — so a new parser
// field appears instead of silently vanishing.
const ATTRIBUTE_LABELS: Record<string, string> = {
  make: 'Make',
  model: 'Model',
  chassisCode: 'Chassis code',
  engine: 'Engine code',
  body: 'Body type',
  fuel: 'Fuel',
  position: 'Position',
};

// Internal parser bookkeeping, not a fact about the part: `inlineMake` is
// the make as it appeared inside the raw name, which always duplicates
// `make` and only confused the customer-facing list.
const HIDDEN_ATTRIBUTES = new Set(['inlineMake']);

function attributeLabel(key: string) {
  return ATTRIBUTE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (_, c: string) => ` ${c.toLowerCase()}`);
}

export function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const partQuery = useQuery({
    queryKey: ['part', id],
    queryFn: () => api.getPart(id!),
    enabled: id !== undefined,
  });

  if (partQuery.isLoading) {
    return <p className="mx-auto max-w-3xl animate-pulse px-5 py-10 text-chalk/60">Loading…</p>;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-red-400">Part not found.</p>
        <Link to="/browse" className="mt-2 inline-block text-sm text-safety underline">
          Back to browse
        </Link>
      </div>
    );
  }

  const part = partQuery.data;
  const attributeEntries = Object.entries(part.attributes).filter(
    ([key, value]) =>
      !HIDDEN_ATTRIBUTES.has(key) && value !== null && !(Array.isArray(value) && value.length === 0),
  );

  // Root has no light background of its own, unlike the staff pages — this
  // sits on the app shell's dark theme (Layout.tsx's bg-graphite), same as
  // BrowsePage, so text here is light-on-dark, not the staff pages' dark
  // card pattern.
  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-white sm:py-10">
      <Link to="/browse" className="inline-flex min-h-11 items-center gap-1 text-sm text-chalk/60 hover:text-safety">
        ← Back to browse
      </Link>

      <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-safety/90">{part.category.name}</p>
      <h1 className="mt-2 font-display text-2xl leading-tight font-bold tracking-tight text-white sm:text-3xl">
        {part.rawName}
      </h1>
      <p className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-chalk/70">
        {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
        <span className="font-semibold">{part.brand?.name ?? 'Unknown brand'}</span>
      </p>

      {/* Stock is deliberately not shown online (PLAN.md §5/§7) — so the
          next step has to be one obvious tap. Was a white box with two
          small text links; on a phone that read as a warning, not an
          action. Now: one primary call button, one secondary. */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
        <p className="text-sm text-chalk/75">Call or visit the shop to check stock on this part.</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <a
            href={telHref(SHOP.phonePrimary)}
            className="pressable flex min-h-12 items-center justify-center gap-2 rounded-full bg-safety px-4 text-sm font-bold text-white transition-colors hover:bg-[#ff6b36]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call shop
          </a>
          <Link
            to="/visit"
            className="pressable flex min-h-12 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-semibold text-chalk transition-colors hover:border-safety hover:text-white"
          >
            Get directions
          </Link>
        </div>
        <p className="mt-2.5 text-center text-xs text-chalk/45">
          Quote part number <span className="font-mono text-chalk/70">{part.partNumber ?? part.rawName}</span> when you call
        </p>
      </div>

      {attributeEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-chalk/50">Specifications</h2>
          <dl className="mt-3 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {attributeEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                <dt className="shrink-0 text-chalk/55">{attributeLabel(key)}</dt>
                <dd className="text-right font-medium text-white">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {part.fitments.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-chalk/50">
            Fits these vehicles <span className="text-chalk/30">({part.fitments.length})</span>
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {part.fitments.map((fitment) => (
              <li
                key={fitment.id}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white"
              >
                {fitment.vehicle.make} {fitment.vehicle.model}
                {fitment.vehicle.chassisCode && (
                  <span className="ml-1.5 font-mono text-xs text-chalk/55">{fitment.vehicle.chassisCode}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
