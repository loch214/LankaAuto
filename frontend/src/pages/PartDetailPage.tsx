import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PartTag } from '../components/PartTag';

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
    return <p className="mx-auto max-w-3xl px-4 py-10 text-muted">Loading…</p>;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-red-600">Part not found.</p>
        <Link to="/browse" className="mt-2 inline-block text-sm text-graphite underline">
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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/browse" className="text-sm text-muted hover:text-safety">
        ← Back to browse
      </Link>

      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-graphite">
        {part.rawName}
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
        <span>{part.brand?.name ?? 'Unknown brand'}</span>
        {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
        <span>{part.category.name}</span>
      </p>

      <div className="mt-4 inline-flex items-center gap-2 rounded-sm border border-muted/30 bg-white px-3 py-1.5 text-sm">
        <span className="font-medium text-graphite">
          {AVAILABILITY_LABEL[part.availabilityStatus] ?? part.availabilityStatus}
        </span>
        <span className="text-muted">
          {part.lastVerifiedAt
            ? `verified ${new Date(part.lastVerifiedAt).toLocaleDateString()}`
            : 'never verified — confirm by phone'}
        </span>
      </div>

      {attributeEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
            Parsed attributes
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {attributeEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted">{key}</dt>
                <dd className="text-graphite">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {part.fitments.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
            Fits these vehicles
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-graphite">
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
