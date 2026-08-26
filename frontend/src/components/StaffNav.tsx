import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-graphite text-chalk' : 'text-graphite hover:bg-graphite/10'
  }`;

/**
 * Sub-nav inside the staff area. Admin-only links only render for
 * `role === 'ADMIN'` — this is a convenience, not the real access control,
 * which is `requireRole('ADMIN')` on the backend (see `ProtectedRoute`).
 */
export function StaffNav() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-muted/20 pb-4">
      <nav className="flex gap-1.5">
        <NavLink to="/staff" end className={linkClass}>
          Search
        </NavLink>
        <NavLink to="/staff/ingest" className={linkClass}>
          Ingest price list
        </NavLink>
        {user?.role === 'ADMIN' && (
          <>
            <NavLink to="/staff/users" className={linkClass}>
              Staff accounts
            </NavLink>
            <NavLink to="/staff/reports" className={linkClass}>
              Reports
            </NavLink>
          </>
        )}
      </nav>
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted">Signed in as {user?.name}</p>
        <button
          type="button"
          onClick={logout}
          className="rounded-sm border border-muted/40 px-3 py-1.5 text-sm text-graphite hover:border-safety"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
