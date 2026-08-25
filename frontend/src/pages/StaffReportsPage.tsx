import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PartTag } from '../components/PartTag';
import { StaffNav } from '../components/StaffNav';
import type { AvailabilityStatus } from '../api/types';

const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  IN_STOCK: 'In stock',
  LOW: 'Low',
  OUT_OF_STOCK: 'Out of stock',
  UNVERIFIED: 'Unverified',
};

function relativeAge(iso: string | null): string {
  if (iso === null) return 'never verified';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'verified today';
  return `verified ${days} day${days === 1 ? '' : 's'} ago`;
}

export function StaffReportsPage() {
  const { token } = useAuth();

  const summaryQuery = useQuery({ queryKey: ['report-stock-summary'], queryFn: () => api.getStockSummary(token!) });
  const staleQuery = useQuery({ queryKey: ['report-stale-parts'], queryFn: () => api.getStaleParts(token!, 20) });
  const activityQuery = useQuery({ queryKey: ['report-activity'], queryFn: () => api.getActivityLog(token!, 20) });
  const outOfStockQuery = useQuery({
    queryKey: ['report-out-of-stock'],
    queryFn: () => api.getOutOfStock(token!, 20),
  });

  return (
    <div className="min-h-screen bg-chalk">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Reports</h1>
        <div className="mt-4">
          <StaffNav />
        </div>

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-graphite">Stock status breakdown</h2>
          {summaryQuery.data && (
            <div className="mt-3 flex flex-wrap gap-3">
              {(Object.keys(STATUS_LABELS) as AvailabilityStatus[]).map((status) => (
                <div key={status} className="rounded-sm border border-muted/30 bg-white px-4 py-3">
                  <p className="text-xs text-muted">{STATUS_LABELS[status]}</p>
                  <p className="font-display text-2xl font-bold text-graphite">
                    {summaryQuery.data.overall[status] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-graphite">Stale / unverified parts</h2>
          <p className="text-sm text-muted">Nobody has verified these within their category's usual window.</p>
          <ul className="mt-3 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {(staleQuery.data?.parts ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-graphite">{p.rawName}</p>
                  <p className="text-xs text-muted">
                    {p.categoryName} · {relativeAge(p.lastVerifiedAt)}
                  </p>
                </div>
                {p.partNumber && <PartTag>{p.partNumber}</PartTag>}
              </li>
            ))}
            {staleQuery.data?.parts.length === 0 && (
              <li className="px-4 py-4 text-center text-muted">Nothing overdue.</li>
            )}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-graphite">Staff activity</h2>
          <ul className="mt-3 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {(activityQuery.data?.entries ?? []).map((entry) => (
              <li key={entry.id} className="px-4 py-2.5 text-sm text-graphite">
                <span className="font-medium">{entry.userName ?? 'removed user'}</span> set{' '}
                <span className="font-medium">{entry.rawName}</span>
                {entry.partNumber && <> ({entry.partNumber})</>} to{' '}
                <span className="font-medium">{STATUS_LABELS[entry.newStatus]}</span>
                <span className="text-muted"> — {new Date(entry.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {activityQuery.data?.entries.length === 0 && (
              <li className="px-4 py-4 text-center text-muted">No activity yet.</li>
            )}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-graphite">Out of stock</h2>
          <ul className="mt-3 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {(outOfStockQuery.data?.parts ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-graphite">{p.rawName}</p>
                  <p className="text-xs text-muted">{p.category.name}</p>
                </div>
                {p.partNumber && <PartTag>{p.partNumber}</PartTag>}
              </li>
            ))}
            {outOfStockQuery.data?.parts.length === 0 && (
              <li className="px-4 py-4 text-center text-muted">Nothing out of stock.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
