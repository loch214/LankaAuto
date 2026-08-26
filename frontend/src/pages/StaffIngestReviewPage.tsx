import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { StagingRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StaffNav } from '../components/StaffNav';

/**
 * Review queue for one ingestion run — every row a `StagingRow`, nothing
 * becomes a real `Part` until an explicit approve. Flagged rows (unresolved
 * category/brand, missing description) need a fix via `PATCH` before they
 * can be approved; clean rows can be approved individually or in bulk via
 * "Approve all clean rows".
 */
export function StaffIngestReviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const rowsQuery = useQuery({
    queryKey: ['ingestion-rows', runId],
    queryFn: () => api.listStagingRows(token!, runId!),
    enabled: runId !== undefined,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['ingestion-rows', runId] });
    void queryClient.invalidateQueries({ queryKey: ['ingestion-runs'] });
  }

  const approveMutation = useMutation({
    mutationFn: (rowId: string) => api.approveStagingRow(token!, rowId),
    onSuccess: invalidate,
  });
  const rejectMutation = useMutation({
    mutationFn: (rowId: string) => api.rejectStagingRow(token!, rowId, 'rejected by staff'),
    onSuccess: invalidate,
  });
  const approveCleanMutation = useMutation({
    mutationFn: () => api.approveCleanRows(token!, runId!),
    onSuccess: invalidate,
  });
  const patchMutation = useMutation({
    mutationFn: ({ rowId, input }: { rowId: string; input: Parameters<typeof api.patchStagingRow>[2] }) =>
      api.patchStagingRow(token!, rowId, input),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const rows = rowsQuery.data ?? [];
  const cleanCount = rows.filter((r) => r.error === null).length;

  return (
    <div className="min-h-screen bg-chalk">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Review import</h1>
        <div className="mt-4">
          <StaffNav />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted">
            {rows.length} pending row{rows.length === 1 ? '' : 's'} — {cleanCount} clean, {rows.length - cleanCount}{' '}
            flagged
          </p>
          <button
            type="button"
            disabled={cleanCount === 0 || approveCleanMutation.isPending}
            onClick={() => approveCleanMutation.mutate()}
            className="rounded-sm bg-safety px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
          >
            {approveCleanMutation.isPending ? 'Approving…' : `Approve all ${cleanCount} clean rows`}
          </button>
        </div>
        {approveCleanMutation.isSuccess && (
          <p className="mt-2 text-sm text-graphite">
            Approved {approveCleanMutation.data.approved} of {approveCleanMutation.data.attempted}.
          </p>
        )}

        <ul className="mt-4 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-graphite">{row.rawName}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Row {row.rowNumber} · {row.parsedAttributes?.categoryName ?? 'no category'}
                    {row.parsedAttributes?.brandName ? ` · ${row.parsedAttributes.brandName}` : ''}
                    {row.parsedAttributes?.partNumber ? ` · ${row.parsedAttributes.partNumber}` : ''}
                    {row.parsedAttributes?.recordNumber ? ` · record ${row.parsedAttributes.recordNumber}` : ''}
                  </p>
                  {row.error !== null && <p className="mt-1 text-sm text-red-600">{row.error}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                    className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs font-medium text-graphite hover:border-safety"
                  >
                    {editingId === row.id ? 'Close' : 'Fix'}
                  </button>
                  <button
                    type="button"
                    disabled={row.error !== null || approveMutation.isPending}
                    onClick={() => approveMutation.mutate(row.id)}
                    className="rounded-sm border border-safety bg-safety px-2.5 py-1 text-xs font-medium text-graphite hover:bg-signal disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(row.id)}
                    className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs font-medium text-red-700 hover:border-red-600"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {editingId === row.id && (
                <FixRowForm
                  row={row}
                  isSaving={patchMutation.isPending}
                  onSave={(input) => patchMutation.mutate({ rowId: row.id, input })}
                />
              )}
            </li>
          ))}
          {rows.length === 0 && !rowsQuery.isLoading && (
            <li className="px-4 py-6 text-center text-muted">Nothing pending — every row has been approved or rejected.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

interface FixRowFormProps {
  row: StagingRow;
  isSaving: boolean;
  onSave: (input: {
    rawName?: string;
    partNumber?: string | null;
    recordNumber?: string | null;
    newCategoryName?: string;
    newBrandName?: string;
  }) => void;
}

/** Row-level fix: rename, or supply a new category/brand name to create and attach it. */
function FixRowForm({ row, isSaving, onSave }: FixRowFormProps) {
  const [rawName, setRawName] = useState(row.rawName);
  const [newCategoryName, setNewCategoryName] = useState(row.parsedAttributes?.categoryName ?? '');
  const [newBrandName, setNewBrandName] = useState(row.parsedAttributes?.brandName ?? '');
  const [partNumber, setPartNumber] = useState(row.parsedAttributes?.partNumber ?? '');
  const [recordNumber, setRecordNumber] = useState(row.parsedAttributes?.recordNumber ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          rawName,
          partNumber: partNumber.trim() === '' ? null : partNumber.trim(),
          recordNumber: recordNumber.trim() === '' ? null : recordNumber.trim(),
          ...(newCategoryName.trim() !== '' ? { newCategoryName: newCategoryName.trim() } : {}),
          ...(newBrandName.trim() !== '' ? { newBrandName: newBrandName.trim() } : {}),
        });
      }}
      className="mt-3 grid grid-cols-1 gap-2 rounded-sm border border-muted/30 bg-chalk p-3 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-0.5 text-xs text-muted">
        Description
        <input
          value={rawName}
          onChange={(e) => setRawName(e.target.value)}
          className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted">
        Part number
        <input
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          className="rounded-sm border border-muted/40 bg-white px-2 py-1 font-mono text-sm text-graphite"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted">
        Category name (creates it if new)
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted">
        Brand name (creates it if new)
        <input
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-muted">
        Record number
        <input
          value={recordNumber}
          onChange={(e) => setRecordNumber(e.target.value)}
          className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
        />
      </label>
      <div className="col-span-full">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-sm bg-safety px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
