import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { SHOP, telHref } from '../shopInfo';
import { ChatWidget } from './ChatWidget';
import { useSmoothScroll } from '../hooks/useSmoothScroll';

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-2xl font-bold tracking-tight ${className}`}>
      LANKA<span className="text-safety">AUTO</span>
    </span>
  );
}

/** Nav + footer shared by every page. */
export function Layout({ children }: { children: ReactNode }) {
  useSmoothScroll();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  // Customer agent only (Phase 5) — staff have their own fast-search tool
  // (StaffSearchPage), and the staff agent (PLAN.md §8) is a separate,
  // later increment with different tools/tone, not this widget reused.
  const isStaffRoute = location.pathname.startsWith('/staff');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Below `sm`, the full nav (Browse Parts / Visit Us / phone / Staff
  // Login) doesn't fit on one row without wrapping — confirmed via a real
  // CDP mobile-viewport screenshot (390×844), not just guessed. The
  // dropdown below is mobile-only; nothing at `sm:` and above changes.
  // Closing it on navigation is done during render (React's documented
  // "adjust state during render" pattern), not in an effect, so it
  // doesn't trigger a second render pass just to flip one boolean.
  const [mobileNavPathname, setMobileNavPathname] = useState(location.pathname);
  if (location.pathname !== mobileNavPathname) {
    setMobileNavPathname(location.pathname);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-graphite text-chalk">


      {/* ─── Main Navbar ─── */}
      <header
        className={`chrome-glass sticky top-0 z-50 border-b border-white/5 bg-graphite/85 backdrop-blur-xl transition-shadow duration-300 ${
          scrolled ? 'shadow-[0_10px_30px_-15px_rgba(0,0,0,0.7)]' : 'shadow-none'
        }`}
      >
        {/* Brand gradient hairline, matching the footer's accent bar. */}
        <div className="h-[2px] w-full bg-gradient-to-r from-safety via-signal to-safety opacity-80" />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6 sm:py-5">
          <Link to="/" className="shrink-0 group flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-safety shadow-[0_0_10px_2px_rgba(255,90,31,0.6)]" />
            <Wordmark className="text-xl text-chalk transition-opacity group-hover:opacity-80 sm:text-2xl" />
          </Link>

          {/* Desktop nav — unchanged from before, still `sm:` and up only. */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-chalk/80 sm:flex sm:gap-8">
            <Link to="/browse" className="relative py-1 transition-colors hover:text-white after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-safety after:transition-all hover:after:w-full">
              Browse Parts
            </Link>
            <Link to="/visit" className="relative py-1 transition-colors hover:text-white after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-safety after:transition-all hover:after:w-full">
              Visit Us
            </Link>
            <a href={telHref(SHOP.phonePrimary)} className="flex items-center gap-2 text-safety hover:text-signal transition-colors font-bold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {SHOP.phonePrimary}
            </a>
            <Link
              to={user !== null ? '/staff' : '/staff/login'}
              className="rounded-full border border-chalk/20 bg-white/[0.03] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-chalk shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-safety hover:bg-safety hover:text-white hover:shadow-[0_4px_16px_-4px_rgba(255,90,31,0.6)]"
            >
              {user !== null ? 'Staff' : 'Staff Login'}
            </Link>
          </nav>

          {/* Mobile nav trigger — below `sm` only. A compact Staff pill
              (never "Staff Login", so it can't wrap) plus a hamburger that
              opens the dropdown below for the links that don't fit. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Link
              to={user !== null ? '/staff' : '/staff/login'}
              className="pressable flex h-11 items-center rounded-full border border-chalk/20 bg-white/[0.03] px-4 text-xs font-semibold uppercase tracking-wider text-chalk shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-safety hover:bg-safety hover:text-white"
            >
              Staff
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
              className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-chalk/20 text-chalk transition-colors hover:border-safety hover:text-safety"
            >
              {mobileNavOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown — the links that don't fit in the top row on a
            narrow screen. `sm:hidden` so it never renders once the full
            desktop nav takes over. Opens downward out of the header it
            belongs to and closes back up into it — same path both ways, so it reads as one panel
            sliding, not two unrelated animations. Critically damped spring
            (bounce 0): a tap carries no momentum, so no overshoot. */}
        <AnimatePresence initial={false}>
          {mobileNavOpen && (
            <motion.nav
              key="mobile-nav"
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="overflow-hidden border-t border-white/5 sm:hidden"
            >
              <ul className="flex flex-col px-3 py-2 text-base font-medium text-chalk/85">
                <li>
                  <Link to="/browse" className="flex min-h-12 items-center justify-between rounded-xl px-3 transition-colors active:bg-white/10">
                    Browse Parts
                    <span aria-hidden="true" className="text-chalk/30">›</span>
                  </Link>
                </li>
                <li>
                  <Link to="/visit" className="flex min-h-12 items-center justify-between rounded-xl px-3 transition-colors active:bg-white/10">
                    Visit Us
                    <span aria-hidden="true" className="text-chalk/30">›</span>
                  </Link>
                </li>
                <li>
                  <a
                    href={telHref(SHOP.phonePrimary)}
                    className="flex min-h-12 items-center gap-2 rounded-xl px-3 font-bold text-safety transition-colors active:bg-white/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call {SHOP.phonePrimary}
                  </a>
                </li>
              </ul>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>

      {/* ─── Premium Footer ─── */}
      <footer className="relative overflow-hidden bg-graphite text-chalk">
        {/* Gradient accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-safety via-signal to-safety" />

        {/* Pegboard texture + a soft safety-orange glow behind the wordmark —
            reads as the shop's back wall rather than a flat SaaS footer. */}
        <div className="pegboard pointer-events-none absolute inset-0 opacity-[0.03]" />
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-safety/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 pt-12 pb-28 sm:pb-12">
          {/* Two columns even on phones: in one column the footer was a
              full extra screen of scrolling for four short lists. The
              brand blurb and hours span both columns since they're wider. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {/* Brand column */}
            <div className="col-span-2 lg:col-span-1">
              <Wordmark className="text-2xl" />
              <p className="mt-3 text-sm leading-relaxed text-chalk/50">
                Japanese Motor Vehicle Spares since {SHOP.founded}. Precision components for every vehicle on Sri Lankan roads.
              </p>
              <div className="mt-5 flex gap-3">
                <a href={SHOP.facebook} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-chalk/10 text-chalk/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-safety hover:bg-safety/10 hover:text-safety hover:shadow-[0_4px_16px_-4px_rgba(255,90,31,0.5)]">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-display text-sm font-bold uppercase tracking-widest text-chalk/90">Quick Links</h4>
              <ul className="mt-5 space-y-2.5">
                <li><Link to="/browse" className="group inline-flex items-center text-sm text-chalk/40 transition-all hover:translate-x-1 hover:text-safety">
                  <span className="mr-0 h-px w-0 bg-safety transition-all group-hover:mr-2 group-hover:w-3" />Browse Parts
                </Link></li>
                <li><Link to="/visit" className="group inline-flex items-center text-sm text-chalk/40 transition-all hover:translate-x-1 hover:text-safety">
                  <span className="mr-0 h-px w-0 bg-safety transition-all group-hover:mr-2 group-hover:w-3" />Visit Our Store
                </Link></li>
                <li><Link to={user !== null ? '/staff' : '/staff/login'} className="group inline-flex items-center text-sm text-chalk/40 transition-all hover:translate-x-1 hover:text-safety">
                  <span className="mr-0 h-px w-0 bg-safety transition-all group-hover:mr-2 group-hover:w-3" />Staff Portal
                </Link></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-display text-sm font-bold uppercase tracking-widest text-chalk/90">Contact</h4>
              <ul className="mt-5 space-y-2.5 text-sm text-chalk/40">
                <li>
                  <a href={telHref(SHOP.phonePrimary)} className="transition-colors hover:text-safety">{SHOP.phonePrimary}</a>
                </li>
                <li>
                  <a href={telHref(SHOP.phoneSecondary)} className="transition-colors hover:text-safety">{SHOP.phoneSecondary}</a>
                </li>
                <li>
                  <a href={`mailto:${SHOP.email}`} className="transition-colors hover:text-safety">{SHOP.email}</a>
                </li>
              </ul>
            </div>

            {/* Hours */}
            <div className="col-span-2 sm:col-span-1">
              <h4 className="font-display text-sm font-bold uppercase tracking-widest text-chalk/90">Store Hours</h4>
              <ul className="mt-5 space-y-2.5 text-sm text-chalk/40">
                {SHOP.hours.map((h) => (
                  <li key={h.day} className="flex items-center justify-between gap-4">
                    <span>{h.day}</span>
                    <span className="font-medium text-chalk/60">{h.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-chalk/10 pt-6 sm:flex-row">
            <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-chalk/30">
              © {new Date().getFullYear()} LankaAuto. All rights reserved.
              <span className="h-1 w-1 rounded-full bg-chalk/20" />
              <span className="text-chalk/20">Since {SHOP.founded}</span>
            </p>
            <p className="text-center text-xs text-chalk/30">
              {SHOP.addressLine1}, {SHOP.addressLine2}
            </p>
          </div>
        </div>
      </footer>

      {!isStaffRoute && <ChatWidget />}
    </div>
  );
}
