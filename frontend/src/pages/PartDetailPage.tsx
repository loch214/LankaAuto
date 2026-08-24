import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';

const AVAILABILITY_LABEL: Record<string, string> = {
  IN_STOCK: 'In stock',
  LOW: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  UNVERIFIED: 'Not yet verified',
};

/**
 * Part detail page. Shows the raw name (source of truth — see the
 * `Part.rawName` schema comment), parsed attributes, and every vehicle
 * fitment. No "cross-referenced alternatives" section yet — PLAN.md §6/§8
 * has cross_references cut pending a data-source decision, and no availability
 * "freshness" copy beyond the raw timestamp — the phrased freshness UI
 * (PLAN.md §5, "verified 3 days ago") is a small enough follow-up to do once
 * there's real verified data to look at, not synthetic UNVERIFIED rows.
 */
export function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const partQuery = useQuery({
    queryKey: ['part', id],
    queryFn: () => api.getPart(id!),
    enabled: id !== undefined,
  });

  if (partQuery.isLoading) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-slate-500">Loading…</p>;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-red-600">Part not found.</p>
        <Link to="/" className="mt-2 inline-block text-sm text-slate-600 underline">
          Back to browse
        </Link>
      </div>
    );
  }

  const part = partQuery.data;
  const attributeEntries = Object.entries(part.attributes).filter(
    ([, value]) => value !== null && !(Array.isArray(value) && value.length === 0),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-slate-600 underline">
        ← Back to browse
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{part.rawName}</h1>
      <p className="mt-1 text-slate-500">
        {part.brand?.name ?? 'Unknown brand'} · {part.partNumber ?? 'no part number'} ·{' '}
        {part.category.name}
      </p>

      <div className="mt-4 inline-flex items-center gap-2 rounded bg-slate-100 px-3 py-1.5 text-sm">
        <span className="font-medium text-slate-700">
          {AVAILABILITY_LABEL[part.availabilityStatus] ?? part.availabilityStatus}
        </span>
        <span className="text-slate-400">
          {part.lastVerifiedAt
            ? `verified ${new Date(part.lastVerifiedAt).toLocaleDateString()}`
            : 'never verified — confirm by phone'}
        </span>
      </div>

      {attributeEntries.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Parsed attributes
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {attributeEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{key}</dt>
                <dd className="text-slate-900">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {part.fitments.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Fits these vehicles
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-900">
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
