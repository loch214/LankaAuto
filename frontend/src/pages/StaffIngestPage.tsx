import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { IngestionMapping, IngestionPreview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StaffNav } from '../components/StaffNav';

interface MappingState {
  category: string;
  subCategory: string;
  brand: string;
  partNumber: string;
  rawName: string;
  recordNumber: string;
  fitmentText: string;
}

const EMPTY_MAPPING: MappingState = {
  category: '',
  subCategory: '',
  brand: '',
  partNumber: '',
  rawName: '',
  recordNumber: '',
  fitmentText: '',
};

const FIELD_LABELS: { key: keyof MappingState; label: string; required: boolean }[] = [
  { key: 'category', label: 'Category', required: true },
  { key: 'subCategory', label: 'Sub-category (optional)', required: false },
  { key: 'brand', label: 'Brand (optional)', required: false },
  { key: 'partNumber', label: 'Part number (optional)', required: false },
  { key: 'rawName', label: 'Description', required: true },
  { key: 'recordNumber', label: 'Record / line number (optional)', required: false },
  { key: 'fitmentText', label: 'Fitment / vehicle text (optional)', required: false },
];

/**
 * Price-list ingestion — step 1 of the new pipeline: upload an Excel/CSV
 * price list, map its columns to catalogue fields (layout varies file to
 * file, per the user), then hand off to the review queue
 * (`StaffIngestReviewPage`) where each row becomes a real `Part` only after
 * an explicit approve.
 */
export function StaffIngestPage() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IngestionPreview | null>(null);
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [folderLabel, setFolderLabel] = useState('');

  const previewMutation = useMutation({
    mutationFn: (f: File) => api.previewIngestion(token!, f),
    onSuccess: (result) => {
      setPreview(result);
      // Best-effort auto-guess: if a header's text obviously matches a
      // field name, pre-fill it — staff can still change any of these.
      const guess = (needle: string) =>
        result.headers.find((h) => h.toLowerCase().includes(needle)) ?? '';
      setMapping({
        category: guess('categ'),
        subCategory: guess('sub'),
        brand: guess('brand'),
        partNumber: guess('part') || guess('code'),
        rawName: guess('desc') || guess('name'),
        recordNumber: guess('record') || guess('line') || guess('no.'),
        fitmentText: guess('fit') || guess('vehicle'),
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (preview === null) throw new Error('no file previewed yet');
      const ingestionMapping: IngestionMapping = {
        category: mapping.category,
        rawName: mapping.rawName,
        ...(mapping.subCategory !== '' ? { subCategory: mapping.subCategory } : {}),
        ...(mapping.brand !== '' ? { brand: mapping.brand } : {}),
        ...(mapping.partNumber !== '' ? { partNumber: mapping.partNumber } : {}),
        ...(mapping.recordNumber !== '' ? { recordNumber: mapping.recordNumber } : {}),
        ...(mapping.fitmentText !== '' ? { fitmentText: mapping.fitmentText } : {}),
      };
      return api.importIngestion(token!, {
        sourceFile: preview.sourceFile,
        ...(folderLabel.trim() !== '' ? { folderLabel: folderLabel.trim() } : {}),
        mapping: ingestionMapping,
        rows: preview.rows,
      });
    },
  });

  const runsQuery = useQuery({ queryKey: ['ingestion-runs'], queryFn: () => api.listIngestionRuns(token!) });

  const canImport = mapping.category !== '' && mapping.rawName !== '' && preview !== null;

  return (
    <div className="min-h-screen bg-chalk">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Ingest a price list</h1>
        <div className="mt-4">
          <StaffNav />
        </div>

        <div className="mt-6 rounded-sm border border-muted/30 bg-white p-4">
          <p className="text-sm font-medium text-graphite">1. Upload the file</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-graphite"
            />
            <button
              type="button"
              disabled={file === null || previewMutation.isPending}
              onClick={() => file && previewMutation.mutate(file)}
              className="rounded-sm bg-safety px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
            >
              {previewMutation.isPending ? 'Reading…' : 'Read file'}
            </button>
          </div>
          {previewMutation.isError && (
            <p className="mt-2 text-sm text-red-600">
              {previewMutation.error instanceof Error ? previewMutation.error.message : 'Could not read that file.'}
            </p>
          )}
        </div>

        {preview !== null && (
          <div className="mt-4 rounded-sm border border-muted/30 bg-white p-4">
            <p className="text-sm font-medium text-graphite">
              2. Map columns — {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} found
            </p>

            <label className="mt-3 flex max-w-xs flex-col gap-0.5 text-xs text-muted">
              Physical price-list folder (staff only — e.g. "4 — Electrical Parts")
              <input
                value={folderLabel}
                onChange={(e) => setFolderLabel(e.target.value)}
                className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
              />
            </label>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELD_LABELS.map(({ key, label, required }) => (
                <label key={key} className="flex flex-col gap-0.5 text-xs text-muted">
                  {label}
                  {required && <span className="text-safety"> *</span>}
                  <select
                    value={mapping[key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
                  >
                    <option value="">— none —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-muted/30 text-muted">
                    {preview.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-muted/10">
                      {preview.headers.map((h) => (
                        <td key={h} className="whitespace-nowrap px-2 py-1 text-graphite">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 5 && (
                <p className="mt-1 text-xs text-muted">…and {preview.rows.length - 5} more.</p>
              )}
            </div>

            <button
              type="button"
              disabled={!canImport || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="mt-4 rounded-sm bg-safety px-4 py-2 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
            >
              {importMutation.isPending ? 'Importing…' : `Import ${preview.rows.length} rows`}
            </button>
            {importMutation.isError && (
              <p className="mt-2 text-sm text-red-600">
                {importMutation.error instanceof Error ? importMutation.error.message : 'Import failed.'}
              </p>
            )}
            {importMutation.isSuccess && (
              <div className="mt-3 rounded-sm bg-graphite/5 p-3 text-sm text-graphite">
                Imported {importMutation.data.rowsTotal} rows — {importMutation.data.rowsFlagged} need review.{' '}
                <Link to={`/staff/ingest/${importMutation.data.runId}`} className="font-medium text-safety underline">
                  Go to review →
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <p className="text-sm font-medium text-graphite">Past uploads</p>
          <ul className="mt-2 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {(runsQuery.data ?? []).map((run) => (
              <li key={run.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <p className="text-graphite">{run.sourceFile}</p>
                  <p className="text-xs text-muted">
                    {run.folderLabel ?? 'no folder set'} · {run.rowsTotal} rows · {run.rowsFlagged} flagged ·{' '}
                    {new Date(run.startedAt).toLocaleString()}
                  </p>
                </div>
                <Link to={`/staff/ingest/${run.id}`} className="text-safety underline">
                  Review
                </Link>
              </li>
            ))}
            {(runsQuery.data ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-muted">No uploads yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
