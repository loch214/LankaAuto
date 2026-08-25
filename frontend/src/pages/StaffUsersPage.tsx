import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StaffNav } from '../components/StaffNav';

/**
 * Admin-only staff account management (PLAN.md: "there is no signup page by
 * design" still holds — an admin creating a coworker's login is not a
 * self-registration flow, it's the same bootstrap `seed:admin` already does,
 * just from the UI instead of an env-driven script).
 */
export function StaffUsersPage() {
  const { token, user: me } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ['staff-accounts'], queryFn: () => api.listStaffAccounts(token!) });

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });

  const createMutation = useMutation({
    mutationFn: () => api.createStaffAccount(token!, { username, name, password, role }),
    onSuccess: () => {
      setUsername('');
      setName('');
      setPassword('');
      setRole('STAFF');
      setCreateError(null);
      void invalidate();
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : 'Could not create the account.'),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: string; isActive?: boolean; role?: 'STAFF' | 'ADMIN'; password?: string }) =>
      api.updateStaffAccount(token!, id, input),
    onSuccess: (_data, vars) => {
      setRowError((prev) => ({ ...prev, [vars.id]: '' }));
      void invalidate();
    },
    onError: (err, vars) =>
      setRowError((prev) => ({
        ...prev,
        [vars.id]: err instanceof ApiError ? err.message : 'That update failed.',
      })),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteStaffAccount(token!, id),
    onSuccess: (_data, id) => {
      setRowError((prev) => ({ ...prev, [id]: '' }));
      void invalidate();
    },
    onError: (err, id) =>
      setRowError((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : 'Delete failed.' })),
  });

  return (
    <div className="min-h-screen bg-chalk">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Staff accounts</h1>
        <div className="mt-4">
          <StaffNav />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-sm border border-muted/30 bg-white p-4"
        >
          <div>
            <label className="block text-xs font-medium text-graphite" htmlFor="new-username">
              Username
            </label>
            <input
              id="new-username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-40 rounded-sm border border-muted/40 bg-white px-2 py-1.5 text-sm text-graphite focus:border-safety focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-graphite" htmlFor="new-name">
              Name
            </label>
            <input
              id="new-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-40 rounded-sm border border-muted/40 bg-white px-2 py-1.5 text-sm text-graphite focus:border-safety focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-graphite" htmlFor="new-password">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-40 rounded-sm border border-muted/40 bg-white px-2 py-1.5 text-sm text-graphite focus:border-safety focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-graphite" htmlFor="new-role">
              Role
            </label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'STAFF' | 'ADMIN')}
              className="mt-1 rounded-sm border border-muted/40 bg-white px-2 py-1.5 text-sm text-graphite focus:border-safety focus:outline-none"
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-sm bg-safety px-4 py-2 text-sm font-semibold text-graphite hover:bg-signal disabled:opacity-50"
          >
            Create account
          </button>
          {createError && <p className="w-full text-sm text-red-600">{createError}</p>}
        </form>

        {usersQuery.isLoading && <p className="mt-4 text-muted">Loading…</p>}
        {usersQuery.isError && <p className="mt-4 text-red-600">Could not load accounts.</p>}

        {usersQuery.data && (
          <ul className="mt-4 divide-y divide-muted/20 rounded-sm border border-muted/30 bg-white">
            {usersQuery.data.map((account) => {
              const isSelf = account.id === me?.id;
              return (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-graphite">
                      {account.name} <span className="text-muted">({account.username})</span>
                      {!account.isActive && (
                        <span className="ml-2 rounded-sm bg-muted/20 px-1.5 py-0.5 text-xs text-muted">
                          deactivated
                        </span>
                      )}
                    </p>
                    {rowError[account.id] && <p className="text-xs text-red-600">{rowError[account.id]}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={account.role}
                      disabled={isSelf || patchMutation.isPending}
                      onChange={(e) =>
                        patchMutation.mutate({ id: account.id, role: e.target.value as 'STAFF' | 'ADMIN' })
                      }
                      className="rounded-sm border border-muted/40 bg-white px-2 py-1 text-xs text-graphite disabled:opacity-50"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <button
                      type="button"
                      disabled={isSelf || patchMutation.isPending}
                      onClick={() => patchMutation.mutate({ id: account.id, isActive: !account.isActive })}
                      className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs text-graphite hover:border-safety disabled:opacity-50"
                    >
                      {account.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      disabled={patchMutation.isPending}
                      onClick={() => {
                        const next = window.prompt(`New password for ${account.username} (min 8 characters):`);
                        if (next !== null && next.length > 0) {
                          patchMutation.mutate({ id: account.id, password: next });
                        }
                      }}
                      className="rounded-sm border border-muted/40 px-2.5 py-1 text-xs text-graphite hover:border-safety"
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      disabled={isSelf || deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete ${account.username}? This cannot be undone.`)) {
                          deleteMutation.mutate(account.id);
                        }
                      }}
                      className="rounded-sm border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
