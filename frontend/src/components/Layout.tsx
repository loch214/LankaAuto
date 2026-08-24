import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** Nav + footer shared by every page. */
export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-chalk">
      <header className="bg-graphite">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight text-chalk">
            LANKA<span className="text-safety">AUTO</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-chalk">
            <Link to="/browse" className="hover:text-safety">
              Browse parts
            </Link>
            <a href="/#visit" className="hover:text-safety">
              Visit us
            </a>
            <Link to={user !== null ? '/staff' : '/staff/login'} className="text-muted hover:text-safety">
              {user !== null ? 'Staff' : 'Staff login'}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-graphite">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">
          <p className="font-display text-lg text-chalk">
            LANKA<span className="text-safety">AUTO</span>
          </p>
          <p className="mt-2">Genuine and aftermarket parts, priced straight, no guesswork on fitment.</p>
        </div>
      </footer>
    </div>
  );
}
