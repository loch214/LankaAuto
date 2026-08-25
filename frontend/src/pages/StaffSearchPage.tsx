import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AvailabilityStatus, SearchMatchType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PartTag } from '../components/PartTag';

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW', label: 'Low' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
];

const MATCH_LABELS: Record<SearchMatchType, string> = {
  'exact-number': 'exact part number',
  'fuzzy-number': 'closest part number',
  semantic: 'similar description',
};

/** One row's worth of fields, whichever endpoint produced it. */
interface ResultRow {
  id: string;
  rawName: string;
  partNumber: string | null;
  location: string | null;
  availabilityStatus: AvailabilityStatus;
  matchType?: SearchMatchType;
}

/**
 * Staff fast search — PLAN.md §8: "single search box, part number or
 * description, results in one screen with location + availability" plus
 * PLAN.md §5's one-tap status update. Deliberately no separate edit form —
 * the whole point of the availability model is that staff tap a button, not
 * fill in a quantity.
 */
export function StaffSearchPage() {
  const { user, token, logout } = useAuth();
  const [q, setQ] = useState('');
  const queryClient = useQueryClient();

  const trimmedQ = q.trim();

  // Blank box: browse everything (plain listing). Typed a query: hybrid
  // exact/fuzzy/semantic search — see `api.searchParts` and
  // `hybrid-part-search.ts`. Two different endpoints because "show me
  // everything" and "find the thing I'm holding or describing" aren't the
  // same request.
  const partsQuery = useQuery({
    queryKey: ['staff-parts-browse'],
    queryFn: () => api.listParts({ limit: 50 }),
    enabled: trimmedQ === '',
  });

  const searchQuery = useQuery({
    queryKey: ['staff-parts-search', trimmedQ],
    queryFn: () => api.searchParts(trimmedQ, 20),
    enabled: trimmedQ !== '',
  });

  const isLoading = trimmedQ === '' ? partsQuery.isLoading : searchQuery.isLoading;
  const isError = trimmedQ === '' ? partsQuery.isError : searchQuery.isError;
  const results: ResultRow[] =
    trimmedQ === ''
      ? (partsQuery.data?.parts ?? []).map((p) => ({
          id: p.id,
          rawName: p.rawName,
          partNumber: p.partNumber,
          location: p.location,
          availabilityStatus: p.availabilityStatus,
        }))
      : (searchQuery.data ?? []).map((h) => ({
          id: h.partId,
          rawName: h.rawName,
          partNumber: h.partNumber,
          location: h.location,
          availabilityStatus: h.availabilityStatus,
          matchType: h.matchType,
        }));

  const updateMutation = useMutation({
    mutationFn: ({ partId, status }: { partId: string; status: AvailabilityStatus }) =>
      api.updateAvailability(token!, partId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-search'] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Staff search</h1>
          <p className="text-sm text-muted">Signed in as {user?.name}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite hover:border-safety"
        >
          Sign out
        </button>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Part number or description"
        autoFocus
        className="mt-6 w-full rounded-sm border border-muted/40 bg-white px-4 py-3 font-mono text-sm focus:border-safety focus:outline-none"
      />

      {isLoading && <p className="mt-4 text-muted">Loading…</p>}
      {isError && <p className="mt-4 text-red-600">Could not load parts.</p>}

      {!isLoading && !isError && (
        <ul className="mt-4 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
          {results.map((part) => (
            <li key={part.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-graphite">{part.rawName}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                  {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                  <span>{part.location ?? 'no location on file'}</span>
                  {part.matchType && part.matchType !== 'exact-number' && (
                    <span className="rounded-sm bg-signal/20 px-1.5 py-0.5 text-xs text-graphite">
                      {MATCH_LABELS[part.matchType]}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ partId: part.id, status: opt.value })}
                    className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      part.availabilityStatus === opt.value
                        ? 'border-safety bg-safety text-graphite'
                        : 'border-muted/40 text-graphite hover:border-safety'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-muted">No parts match.</li>
          )}
        </ul>
      )}
    </div>
  );
}
