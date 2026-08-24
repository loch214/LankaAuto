import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Placeholder shop details — real address/phone/hours were never provided.
// Swap these for the real thing when available (see HANDOFF.md §4).
const SHOP = {
  addressLine1: '24 Orugodawatta Road',
  addressLine2: 'Colombo 14, Sri Lanka',
  phonePrimary: '+94 77 123 4567',
  phoneSecondary: '+94 71 987 6543',
  email: 'sales@lankaauto.lk',
  hours: [
    { day: 'Monday – Friday', time: '8.00 AM – 6.00 PM' },
    { day: 'Saturday', time: '8.00 AM – 4.00 PM' },
    { day: 'Sunday', time: 'Closed' },
  ],
};

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4 shrink-0">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5c0-.55.45-1 1-1h2.5a1 1 0 0 1 .97.76l1 4a1 1 0 0 1-.5 1.11L7.3 10.6a11 11 0 0 0 6.1 6.1l.73-1.67a1 1 0 0 1 1.11-.5l4 1a1 1 0 0 1 .76.97V19c0 .55-.45 1-1 1h-1C10.2 20 4 13.8 4 6V5Z"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4 shrink-0">
      <circle cx="12" cy="12" r="8.25" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
  );
}

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-2xl font-bold tracking-tight ${className}`}>
      LANKA<span className="text-safety">AUTO</span>
    </span>
  );
}

/** Nav + footer shared by every page. */
export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-chalk">
      <header className="sticky top-0 z-50 border-b-[3px] border-safety bg-graphite/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="shrink-0">
            <Wordmark className="text-chalk" />
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-chalk sm:gap-7">
            <Link to="/browse" className="hover:text-safety">
              Browse parts
            </Link>
            <a href="/#visit" className="hidden hover:text-safety sm:inline">
              Visit us
            </a>
            <a
              href={`tel:${SHOP.phonePrimary.replace(/\s+/g, '')}`}
              className="hidden items-center gap-1.5 font-mono text-xs tracking-wide text-muted hover:text-safety md:flex"
            >
              <PhoneIcon />
              {SHOP.phonePrimary}
            </a>
            <Link
              to={user !== null ? '/staff' : '/staff/login'}
              className="rounded-sm border border-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-chalk hover:border-safety hover:text-safety"
            >
              {user !== null ? 'Staff' : 'Staff login'}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer id="visit" className="relative overflow-hidden border-t-[3px] border-safety bg-graphite text-chalk">
        <div className="pegboard pointer-events-none absolute inset-0 opacity-[0.03]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <p className="font-mono text-xs uppercase tracking-widest text-safety">Visit the counter</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Come find us</h2>

          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
                <PinIcon />
                Location
              </div>
              <p className="mt-3 text-lg leading-snug text-chalk">
                {SHOP.addressLine1}
                <br />
                {SHOP.addressLine2}
              </p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${SHOP.addressLine1}, ${SHOP.addressLine2}`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-medium text-safety hover:text-signal"
              >
                Get directions →
              </a>
            </div>

            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
                <ClockIcon />
                Opening hours
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                {SHOP.hours.map((row) => (
                  <div key={row.day} className="flex justify-between gap-6">
                    <dt className="text-chalk">{row.day}</dt>
                    <dd className="font-mono text-muted">{row.time}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 max-w-[26ch] text-xs text-muted">
                Stock status shown online is a guide — call ahead to confirm anything not recently
                verified.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
                <PhoneIcon />
                Talk to us
              </div>
              <div className="mt-3 space-y-1">
                <a href={`tel:${SHOP.phonePrimary.replace(/\s+/g, '')}`} className="block font-mono text-lg text-chalk hover:text-safety">
                  {SHOP.phonePrimary}
                </a>
                <a href={`tel:${SHOP.phoneSecondary.replace(/\s+/g, '')}`} className="block font-mono text-lg text-chalk hover:text-safety">
                  {SHOP.phoneSecondary}
                </a>
              </div>
              <a href={`mailto:${SHOP.email}`} className="mt-3 inline-block text-sm text-muted hover:text-safety">
                {SHOP.email}
              </a>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-chalk/10 pt-6 sm:flex-row sm:items-center">
            <Wordmark className="text-chalk/70" />
            <p className="text-xs text-muted">
              Genuine and aftermarket parts, priced straight, no guesswork on fitment.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
