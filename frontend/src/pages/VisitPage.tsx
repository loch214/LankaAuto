import { SHOP, shopAddress, shopMapsEmbedUrl, shopMapsSearchUrl, telHref } from '../shopInfo';

/**
 * Standalone store page — the landing page's "store location" section
 * (see LandingPage.tsx) is a teaser that hands off here for the full
 * address, hours, phone and a real map embed. Split out so the landing
 * page stays a fast scroll and this page can be linked/bookmarked/shared
 * directly (e.g. "here's our location" in a message).
 */
export function VisitPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 bg-graphite text-white">
      <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">Visit the counter</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Come find us
      </h1>
      <p className="mt-4 max-w-xl text-chalk/70">
        Bring the part number, the old part, or just tell us the vehicle. Stock status shown online
        is a guide — call ahead to confirm anything not recently verified.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-5">
        {/* Store photo */}
        <div className="lg:col-span-2">
          <div className="relative flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-steel/10 text-center overflow-hidden shadow-2xl">
            <img
              src="/images/store-front.jpg"
              alt="LankaAuto Storefront"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-graphite/80 to-transparent opacity-80" />
            <span className="relative font-display text-3xl font-bold text-white shadow-black drop-shadow-lg z-10">LANKA<span className="text-safety">AUTO</span></span>
          </div>

          <dl className="mt-8 space-y-6">
            <div className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm">
              <dt className="font-sans text-xs font-semibold uppercase tracking-widest text-chalk/50">Address</dt>
              <dd className="mt-2 text-lg font-medium text-white">
                {SHOP.addressLine1}
                <br />
                {SHOP.addressLine2}
              </dd>
              <a
                href={shopMapsSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-safety hover:text-signal transition-colors"
              >
                Open in Google Maps 
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>

            <div className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm">
              <dt className="font-sans text-xs font-semibold uppercase tracking-widest text-chalk/50 mb-4">Opening hours</dt>
              <dd className="mt-1 space-y-2 text-sm">
                {SHOP.hours.map((row) => (
                  <div key={row.day} className="flex justify-between gap-6 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <span className="font-medium text-white">{row.day}</span>
                    <span className="font-mono text-chalk/70">{row.time}</span>
                  </div>
                ))}
              </dd>
            </div>

            <div className="p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm">
              <dt className="font-sans text-xs font-semibold uppercase tracking-widest text-chalk/50">Contact</dt>
              <dd className="mt-3 space-y-2">
                <a href={telHref(SHOP.phonePrimary)} className="block font-display text-xl font-bold text-white transition-colors hover:text-safety">
                  {SHOP.phonePrimary}
                </a>
                <a href={telHref(SHOP.phoneSecondary)} className="block font-display text-lg text-chalk/80 transition-colors hover:text-safety">
                  {SHOP.phoneSecondary}
                </a>
                <p className="pt-2 font-mono text-sm text-chalk/50">Fax {SHOP.fax}</p>
                <a href={`mailto:${SHOP.email}`} className="block mt-2 text-sm text-safety hover:text-signal transition-colors">
                  {SHOP.email}
                </a>
              </dd>
            </div>
          </dl>
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="h-full min-h-[500px] w-full rounded-2xl border border-white/10 overflow-hidden relative group shadow-2xl">
            <iframe
              title={`Map to ${shopAddress}`}
              src={shopMapsEmbedUrl}
              className="absolute inset-0 h-full w-full"
              loading="lazy"
            />
            {/* Overlay to prevent accidental scrolls unless hovered over */}
            <div className="absolute inset-0 bg-graphite/20 pointer-events-none group-hover:bg-transparent transition-colors duration-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
