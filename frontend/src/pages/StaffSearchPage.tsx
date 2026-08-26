import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { AvailabilityStatus, Brand, Category, PartDetail, SearchMatchType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PartTag } from '../components/PartTag';
import { StaffNav } from '../components/StaffNav';

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW', label: 'Low' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
  { value: 'UNVERIFIED', label: 'Unverified' },
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
  /** Staff/admin-only physical price-list citation — only present when the hybrid search endpoint produced this row. */
  folderLabel?: string | null;
  recordNumber?: string | null;
}

/**
 * Staff fast search — PLAN.md §8: "single search box, part number or
 * description, results in one screen with location + availability" plus
 * PLAN.md §5's one-tap status update, and (this session) a bulk,
 * filter-scoped update for the case per-part tapping doesn't scale to.
 */
export function StaffSearchPage() {
  const { token } = useAuth();
  const [q, setQ] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [brandId, setBrandId] = useState('');
  const queryClient = useQueryClient();

  const trimmedQ = q.trim();
  // The hybrid search endpoint (exact/fuzzy/semantic) doesn't take category
  // or brand filters — those only apply to the plain listing, same as the
  // customer-facing browse page. A category/brand filter with no query text
  // is the common "I'm sweeping a category" case bulk updates are for.
  const useSearch = trimmedQ !== '' && categorySlug === '' && brandId === '';

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: () => api.listBrands() });

  const partsQuery = useQuery({
    queryKey: ['staff-parts-browse', trimmedQ, categorySlug, brandId],
    queryFn: () =>
      api.listParts({
        q: trimmedQ || undefined,
        categorySlug: categorySlug || undefined,
        brandId: brandId || undefined,
        limit: 50,
      }),
    enabled: !useSearch,
  });

  const searchQuery = useQuery({
    queryKey: ['staff-parts-search', trimmedQ],
    queryFn: () => api.searchParts(token!, trimmedQ, 20),
    enabled: useSearch,
  });

  const isLoading = useSearch ? searchQuery.isLoading : partsQuery.isLoading;
  const isError = useSearch ? searchQuery.isError : partsQuery.isError;
  const results: ResultRow[] = useSearch
    ? (searchQuery.data ?? []).map((h) => ({
        id: h.partId,
        rawName: h.rawName,
        partNumber: h.partNumber,
        location: h.location,
        availabilityStatus: h.availabilityStatus,
        matchType: h.matchType,
        folderLabel: h.folderLabel,
        recordNumber: h.recordNumber,
      }))
    : (partsQuery.data?.parts ?? []).map((p) => ({
        id: p.id,
        rawName: p.rawName,
        partNumber: p.partNumber,
        location: p.location,
        availabilityStatus: p.availabilityStatus,
      }));

  const updateMutation = useMutation({
    mutationFn: ({ partId, status }: { partId: string; status: AvailabilityStatus }) =>
      api.updateAvailability(token!, partId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-search'] });
    },
  });

  // --- Edit / delete a single part. Editing fetches the full part detail
  // lazily (search hits don't carry categoryId/brandId, only names) rather
  // than threading those ids through every result shape.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editPartDetail = useQuery({
    queryKey: ['part-detail', editingId],
    queryFn: () => api.getPart(editingId!),
    enabled: editingId !== null,
  });

  function invalidatePartLists() {
    void queryClient.invalidateQueries({ queryKey: ['staff-parts-browse'] });
    void queryClient.invalidateQueries({ queryKey: ['staff-parts-search'] });
  }

  const editMutation = useMutation({
    mutationFn: (input: {
      rawName: string;
      categoryId: string;
      brandId: string | null;
      partNumber: string | null;
      folderLabel: string | null;
      recordNumber: string | null;
    }) => api.editPart(token!, editingId!, input),
    onSuccess: () => {
      invalidatePartLists();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (partId: string) => api.deletePart(token!, partId),
    onSuccess: invalidatePartLists,
  });

  // --- Bulk update: filter (category and/or brand, optionally plus q) → dry-run preview → confirm → apply.
  const [bulkStatus, setBulkStatus] = useState<AvailabilityStatus>('IN_STOCK');
  const [bulkPreview, setBulkPreview] = useState<{ matched: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const canBulk = categorySlug !== '' || brandId !== '' || trimmedQ !== '';

  const bulkFilter = {
    q: trimmedQ || undefined,
    categorySlug: categorySlug || undefined,
    brandId: brandId || undefined,
  };

  const dryRunMutation = useMutation({
    mutationFn: () => api.bulkUpdateAvailability(token!, { ...bulkFilter, status: bulkStatus, dryRun: true }),
    onSuccess: (res) => {
      setBulkError(null);
      setBulkPreview({ matched: res.matched });
    },
    onError: (err) => {
      setBulkPreview(null);
      setBulkError(err instanceof Error ? err.message : 'Could not check how many parts match.');
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => api.bulkUpdateAvailability(token!, { ...bulkFilter, status: bulkStatus, dryRun: false }),
    onSuccess: () => {
      setBulkPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-parts-search'] });
    },
    onError: (err) => {
      setBulkError(err instanceof Error ? err.message : 'Bulk update failed.');
    },
  });

  return (
    <div className="min-h-screen bg-chalk">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Staff search</h1>
        <div className="mt-4">
          <StaffNav />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Part number or description"
            autoFocus
            className="min-w-[16rem] flex-1 rounded-sm border border-muted/40 bg-white px-4 py-3 font-mono text-sm text-graphite focus:border-safety focus:outline-none"
          />
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="rounded-sm border border-muted/40 bg-white px-3 py-2 text-sm text-graphite focus:border-safety focus:outline-none"
          >
            <option value="">All categories</option>
            {(categoriesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="rounded-sm border border-muted/40 bg-white px-3 py-2 text-sm text-graphite focus:border-safety focus:outline-none"
          >
            <option value="">All brands</option>
            {(brandsQuery.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk update bar — only meaningful once a filter narrows the set. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-muted/30 bg-white px-4 py-3">
          <p className="text-sm font-medium text-graphite">Bulk update matching parts to:</p>
          <select
            value={bulkStatus}
            onChange={(e) => {
              setBulkStatus(e.target.value as AvailabilityStatus);
              setBulkPreview(null);
            }}
            className="rounded-sm border border-muted/40 bg-white px-2 py-1.5 text-sm text-graphite focus:border-safety focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canBulk || dryRunMutation.isPending}
            onClick={() => dryRunMutation.mutate()}
            className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm font-medium text-graphite hover:border-safety disabled:opacity-50"
          >
            Preview
          </button>
          {!canBulk && <p className="text-xs text-muted">Pick a category, brand, or search text first.</p>}
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          {bulkPreview && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-graphite">
                This will set <strong>{bulkPreview.matched}</strong> part{bulkPreview.matched === 1 ? '' : 's'} to{' '}
                <strong>{STATUS_OPTIONS.find((o) => o.value === bulkStatus)?.label}</strong>.
              </span>
              <button
                type="button"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
                className="rounded-sm bg-safety px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {isLoading && <p className="mt-4 text-muted">Loading…</p>}
        {isError && <p className="mt-4 text-red-600">Could not load parts.</p>}

        {!isLoading && !isError && (
          <ul className="mt-4 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {results.map((part) => (
              <li key={part.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-graphite">{part.rawName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {part.partNumber && <PartTag>{part.partNumber}</PartTag>}
                    <span>{part.location ?? 'no location on file'}</span>
                    {part.matchType && part.matchType !== 'exact-number' && (
                      <span className="rounded-sm bg-signal/20 px-1.5 py-0.5 text-xs text-graphite">
                        {MATCH_LABELS[part.matchType]}
                      </span>
                    )}
                  </p>
                  {(part.folderLabel || part.recordNumber) && (
                    <p className="mt-1 text-xs text-muted/80">
                      Price list:{' '}
                      {[part.folderLabel, part.recordNumber && `record ${part.recordNumber}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}

                  {editingId === part.id && (
                    <EditPartForm
                      detail={editPartDetail.data ?? null}
                      // The customer-safe `GET /parts/:id` this form's detail
                      // query hits never carries folderLabel/recordNumber —
                      // by design (see `CUSTOMER_SAFE_PART_SELECT`). This
                      // row's own value (present only when it came from the
                      // staff search endpoint) is the only place to seed
                      // them from.
                      currentFolderLabel={part.folderLabel ?? null}
                      currentRecordNumber={part.recordNumber ?? null}
                      isLoading={editPartDetail.isLoading}
                      categories={categoriesQuery.data ?? []}
                      brands={brandsQuery.data ?? []}
                      isSaving={editMutation.isPending}
                      onCancel={() => setEditingId(null)}
                      onSave={(input) => editMutation.mutate(input)}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
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
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === part.id ? null : part.id)}
                    className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs font-medium text-graphite hover:border-safety"
                  >
                    {editingId === part.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${part.rawName}"? This cannot be undone.`)) {
                        deleteMutation.mutate(part.id);
                      }
                    }}
                    className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs font-medium text-red-700 hover:border-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-muted">No parts match.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

interface EditPartFormProps {
  detail: PartDetail | null;
  currentFolderLabel: string | null;
  currentRecordNumber: string | null;
  isLoading: boolean;
  categories: Category[];
  brands: Brand[];
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: {
    rawName: string;
    categoryId: string;
    brandId: string | null;
    partNumber: string | null;
    folderLabel: string | null;
    recordNumber: string | null;
  }) => void;
}

/** Inline edit form for one part — fields prefilled once the full part detail loads. */
function EditPartForm({
  detail,
  currentFolderLabel,
  currentRecordNumber,
  isLoading,
  categories,
  brands,
  isSaving,
  onCancel,
  onSave,
}: EditPartFormProps) {
  const [rawName, setRawName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [recordNumber, setRecordNumber] = useState('');
  const [hydrated, setHydrated] = useState(false);

  if (detail !== null && !hydrated) {
    setRawName(detail.rawName);
    setCategoryId(detail.category.id);
    setBrandId(detail.brand?.id ?? '');
    setPartNumber(detail.partNumber ?? '');
    setFolderLabel(currentFolderLabel ?? '');
    setRecordNumber(currentRecordNumber ?? '');
    setHydrated(true);
  }

  if (isLoading || !hydrated) {
    return <p className="mt-2 text-sm text-muted">Loading part details…</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          rawName,
          categoryId,
          brandId: brandId === '' ? null : brandId,
          partNumber: partNumber.trim() === '' ? null : partNumber.trim(),
          folderLabel: folderLabel.trim() === '' ? null : folderLabel.trim(),
          recordNumber: recordNumber.trim() === '' ? null : recordNumber.trim(),
        });
      }}
      className="mt-2 flex flex-col gap-2 rounded-sm border border-muted/30 bg-chalk p-3"
    >
      <div className="grid grid-cols-2 gap-2">
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
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Brand
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
          >
            <option value="">No brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Price-list folder (staff only)
          <input
            value={folderLabel}
            onChange={(e) => setFolderLabel(e.target.value)}
            placeholder="e.g. 4 — Electrical Parts"
            className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Record number (staff only)
          <input
            value={recordNumber}
            onChange={(e) => setRecordNumber(e.target.value)}
            className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-sm text-graphite"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving || rawName.trim() === '' || categoryId === ''}
          className="rounded-sm bg-safety px-3 py-1.5 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
