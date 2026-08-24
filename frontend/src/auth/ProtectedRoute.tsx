import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="mx-auto max-w-md px-4 py-10 text-muted">Checking session…</p>;
  }

  if (user === null) {
    return <Navigate to="/staff/login" replace />;
  }

  return <>{children}</>;
}
