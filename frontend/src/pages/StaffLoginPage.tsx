import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

export function StaffLoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — nothing here to do.
  if (user !== null) {
    return <Navigate to="/staff" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/staff');
    } catch (err) {
      // The backend deliberately returns the same message for "no such
      // account" and "wrong password" — this just surfaces it as-is rather
      // than making up a friendlier one that might leak more.
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-lg border border-white/10 bg-chalk px-6 py-8 shadow-xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-graphite">Staff login</h1>
        <p className="mt-1 text-sm text-muted">For shop staff only.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-graphite" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-sm border border-muted/40 bg-white px-3 py-2 text-sm text-graphite focus:border-safety focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-graphite" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-sm border border-muted/40 bg-white px-3 py-2 text-sm text-graphite focus:border-safety focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-sm bg-safety px-4 py-2.5 text-sm font-semibold text-graphite transition-colors hover:bg-signal disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
