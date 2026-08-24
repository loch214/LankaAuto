import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AvailabilityStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PartTag } from '../components/PartTag';

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW', label: 'Low' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
];

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

  const partsQuery = useQuery({
    queryKey: ['staff-parts', q],
    queryFn: () => api.listParts({ q: q || undefined, limit: 50 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ partId, status }: { partId: string; status: AvailabilityStatus }) =>
      api.updateAvailability(token!, partId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-parts'] });
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

      {partsQuery.isLoading && <p className="mt-4 text-muted">Loading…</p>}
      {partsQuery.isError && <p className="mt-4 text-red-600">Could not load parts.</p>}

      {partsQuery.data && (
        <ul className="mt-4 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
          {partsQuery.data.parts.map((part) => (
            <li key={part.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-graphite">{part.rawName}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                  {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                  <span>{part.location ?? 'no location on file'}</span>
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
          {partsQuery.data.parts.length === 0 && (
            <li className="px-4 py-6 text-center text-muted">No parts match.</li>
          )}
        </ul>
      )}
    </div>
  );
}
