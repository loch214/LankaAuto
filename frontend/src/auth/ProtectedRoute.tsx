import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * `role` is a UX convenience only — a staff member following a stale link
 * to an admin page lands somewhere useful (`/staff`) instead of a dead end.
 * The real enforcement is server-side (`requireRole('ADMIN')` on every
 * `/users` and `/reports` route); this can never be the only thing standing
 * between staff and an admin-only action.
 */
export function ProtectedRoute({ children, role }: { children: ReactNode; role?: 'ADMIN' }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="mx-auto max-w-md px-4 py-10 text-muted">Checking session…</p>;
  }

  if (user === null) {
    return <Navigate to="/staff/login" replace />;
  }

  if (role !== undefined && user.role !== role) {
    return <Navigate to="/staff" replace />;
  }

  return <>{children}</>;
}
