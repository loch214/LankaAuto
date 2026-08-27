import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandMarquee } from '../components/BrandMarquee';
import { useReveal } from '../hooks/useReveal';
import { SHOP, shopAddress, telHref } from '../shopInfo';

const VEHICLE_BRANDS = [
  { id: '1', name: 'Toyota', logo: '/images/brands/toyota.jpg' },
  { id: '2', name: 'Isuzu', logo: '/images/brands/isuzu.jpg' },
  { id: '3', name: 'Mazda', logo: '/images/brands/mazda.jpg' },
  { id: '4', name: 'Suzuki', logo: '/images/brands/suzuki.jpg' },
  { id: '5', name: 'Hyundai', logo: '/images/brands/hyundai.jpg' },
  { id: '6', name: 'Nissan', logo: '/images/brands/nissan.jpg' },
  { id: '7', name: 'Mitsubishi', logo: '/images/brands/mitsubishi.jpg' },
  { id: '8', name: 'Honda', logo: '/images/brands/honda.jpg' },
  { id: '9', name: 'Daihatsu', logo: '/images/brands/daihatsu.jpg' },
  { id: '10', name: 'Hino', logo: '/images/brands/hino.jpg' },
];

// Part-brand logos (e.g. Dokuro) for the "brands we carry" marquee row —
// these are genuinely logos, not product photos, so they stay separate
// from PART_CATEGORIES below.
const PART_BRAND_LOGOS = [
  { id: 'p1', name: 'Part Brand 1', logo: '/images/brands/parts/1.jpg' },
  { id: 'p2', name: 'Part Brand 2', logo: '/images/brands/parts/2.jpg' },
  { id: 'p3', name: 'Part Brand 3', logo: '/images/brands/parts/3.jpg' },
  { id: 'p4', name: 'Part Brand 4', logo: '/images/brands/parts/4.jpg' },
  { id: 'p5', name: 'Part Brand 5', logo: '/images/brands/parts/5.jpg' },
  { id: 'p6', name: 'Part Brand 6', logo: '/images/brands/parts/6.jpg' },
  { id: 'p7', name: 'Part Brand 7', logo: '/images/brands/parts/7.jpg' },
  { id: 'p8', name: 'Part Brand 8', logo: '/images/brands/parts/8.jpg' },
  { id: 'p9', name: 'Part Brand 9', logo: '/images/brands/parts/9.jpg' },
];

// Real spare-part photos for the "Browse" section slider. No brand text
// baked into any of these — see the session notes for why that mattered.
//
// Every file here is pre-normalized to an identical 1200x1200 square by
// `scripts/normalize-part-photos.mjs` (sources in assets-src/parts/). That
// is deliberately an asset-pipeline job, not a CSS one: with all photos on
// one canvas the card below can use plain `object-cover` and always fill
// completely — no crop that slices the part in half, and no letterbox gap
// that reads as an empty box. Add a new photo to assets-src/parts/, re-run
// the script, then list it here.
const PART_CATEGORIES = [
  { id: 'brakes', logo: '/images/parts/brakes.jpg' },
  { id: 'bearings', logo: '/images/parts/bearings.jpg' },
  // NB: gears.jpg currently holds a coil-spring/shock photo, not gears —
  // the file was swapped without renaming. Named by what it shows.
  { id: 'suspension', logo: '/images/parts/gears.jpg' },
  { id: 'gearbox', logo: '/images/parts/gearbox.jpg' },
  { id: 'ujoint', logo: '/images/parts/ujoint.jpg' },
  { id: 'alternator', logo: '/images/parts/alternator.jpg' },
  { id: 'filter', logo: '/images/parts/filter.jpg' },
];

// Radial fade for the ambient glow layer only (not the sharp foreground
// photo) — softens the blurred copy's own rectangular edge so the glow
// itself tapers off into the page rather than stopping abruptly.
const GLOW_FADE_MASK = 'radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 85%)';

const SLIDER_IMAGES = [
  '/images/slider/slide1.jpg',
  '/images/slider/slide2.jpg',
  '/images/slider/slide3.jpg',
  '/images/slider/slide4.jpg',
  '/images/slider/slide5.jpg',
  '/images/slider/slide6.jpg',
];

export function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentPartSlide, setCurrentPartSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDER_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPartSlide((prev) => (prev + 1) % PART_CATEGORIES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const { sectionRef: browseRef, className: browseRevealClass } = useReveal<HTMLElement>();
  const { sectionRef: visitRef, className: visitRevealClass } = useReveal<HTMLElement>();
  const { sectionRef: brandsRef, className: brandsRevealClass } = useReveal<HTMLElement>();
  const { sectionRef: contactRef, className: contactRevealClass } = useReveal<HTMLElement>();

  return (
    <div className="bg-graphite">
      {/* ═══════ 1 — HERO ═══════ */}
      <section className="relative flex h-screen min-h-[600px] flex-col items-center justify-center overflow-hidden bg-graphite">
        {/* Animated background slider */}
        <div className="absolute inset-0 z-0 bg-graphite">
          {SLIDER_IMAGES.map((src, i) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-[2000ms] ease-in-out ${i === currentSlide ? 'opacity-50' : 'opacity-0'
                }`}
            >
              <img
                src={src}
                alt=""
                // Always animating (not gated on i === currentSlide) so the
                // zoom never gets removed-then-reapplied on a slide switch —
                // that reset was visible as a jarring snap-back-to-normal-
                // size mid-fade. Running continuously means whichever phase
                // of the cycle a slide is in when it fades in is just where
                // it is; nothing ever resets.
                className="h-full w-full object-cover animate-[ken-burns_20s_ease-in-out_infinite_alternate]"
              />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/40 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex w-full max-w-7xl flex-col items-center text-center px-6 reveal reveal-slow reveal-visible">
          <h1 className="font-display text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-[7rem]">
            LANKA<span className="text-safety">AUTO</span>
          </h1>
          <p className="mt-8 font-sans text-lg font-bold uppercase tracking-[0.4em] text-white/90 sm:text-xl shadow-black drop-shadow-md">
            Japanese Motor Vehicle Spares · Since {SHOP.founded}
          </p>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              to="/browse"
              className="btn-premium"
            >
              Browse Parts
            </Link>
            <Link
              to="/visit"
              className="rounded-full border border-chalk/30 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:border-white hover:bg-white/10"
            >
              Visit Our Store
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 z-10 flex flex-col items-center gap-2 text-chalk/30">
          <span className="text-xs uppercase tracking-widest text-white/50">Scroll</span>
          <div className="h-10 w-[1px] animate-pulse bg-gradient-to-b from-white/60 to-transparent" />
        </div>
      </section>

      {/* ═══════ 2 — BROWSE CTA ═══════ */}
      <section ref={browseRef} className={`relative z-20 flex h-screen min-h-[600px] flex-col justify-center overflow-hidden bg-graphite ${browseRevealClass}`}>
        <div className="grid w-full lg:h-full lg:grid-cols-2">
          {/* Left Side: Real spare-part photo slider. Neither a hard box
              nor a faded-out edge — a heavily blurred, scaled-up copy of
              the same photo sits behind it as an ambient glow (the
              Apple/Spotify product-shot trick), so its colors bleed softly
              into the page while the photo itself stays crisp and sharp. */}
          <div className="relative order-2 flex items-center justify-center px-6 py-14 lg:order-1 lg:h-full lg:px-12 lg:py-16">
            <div className="relative aspect-square w-full max-w-[460px]">
              {PART_CATEGORIES.map((part, i) => (
                <div
                  key={part.id}
                  className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${i === currentPartSlide ? 'opacity-100' : 'opacity-0'
                    }`}
                >
                  <img
                    src={part.logo}
                    alt=""
                    aria-hidden="true"
                    style={{
                      filter: 'blur(60px) saturate(1.3) brightness(0.85)',
                      maskImage: GLOW_FADE_MASK,
                      WebkitMaskImage: GLOW_FADE_MASK,
                    }}
                    className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60"
                  />
                  <div className="relative h-full w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10">
                    <img
                      src={part.logo}
                      alt=""
                      // object-cover is safe here precisely because every
                      // source is pre-padded to a square (see
                      // PART_CATEGORIES): the container is square too, so
                      // cover fills edge-to-edge without actually cropping
                      // anything off the part.
                      //
                      // Lightly desaturated so the one non-studio photo in
                      // the set (brakes, a real garage shot) sits in the
                      // same tonal family as the studio ones.
                      style={{ filter: 'saturate(0.8) contrast(1.05)' }}
                      // Always animating, not gated on i === currentPartSlide
                      // — see the hero slider's identical fix above for why.
                      className="h-full w-full object-cover animate-[ken-burns_12s_ease-in-out_infinite_alternate]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side: Text & Button */}
          <div className="order-1 flex flex-col justify-center px-8 py-10 sm:px-16 lg:order-2 lg:h-full lg:py-0">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl leading-tight">
              Explore the Full <br /><span className="text-safety">Catalogue</span>
            </h2>
            <p className="mt-6 max-w-md text-base sm:text-lg text-chalk/70 leading-relaxed">
              Engine parts, gearbox parts, brake parts, shock absorbers, electrical parts, lights & mirrors, body parts — all from trusted Japanese brands. We have precisely what you need.
            </p>
            <div className="mt-8">
              <Link to="/browse" className="btn-premium inline-flex w-auto">
                Browse Items
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4 ml-1"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 3 — STORE TEASER ═══════ */}
      <section ref={visitRef} className={`flex h-screen min-h-[600px] flex-col justify-center overflow-hidden bg-graphite text-chalk ${visitRevealClass}`}>
        <div className="grid lg:h-full lg:grid-cols-2">
          <div className="relative flex items-center justify-center px-6 py-14 lg:h-full lg:px-12 lg:py-16">
            <div className="relative aspect-square w-full max-w-[460px]">
              <img
                src="/images/store-front.jpg"
                alt=""
                aria-hidden="true"
                style={{
                  filter: 'blur(60px) saturate(1.3) brightness(0.85)',
                  maskImage: GLOW_FADE_MASK,
                  WebkitMaskImage: GLOW_FADE_MASK,
                }}
                className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60"
              />
              <div className="relative h-full w-full overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10">
                <img
                  src="/images/store-front.jpg"
                  alt="LankaAuto Storefront"
                  style={{ filter: 'saturate(0.55) contrast(1.05) brightness(0.95)' }}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center px-8 py-8 sm:px-16 lg:py-0">
            <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">
              Our Flagship Store
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Experience the<br />difference in person
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-chalk/60">
              Bring the part number, the old part, or just tell us the vehicle — staff will pull it straight off the rack.
            </p>
            <p className="mt-4 text-sm font-medium text-chalk/80">
              {shopAddress}
            </p>
            <div className="mt-8">
              <Link
                to="/visit"
                className="btn-premium inline-flex w-auto"
              >
                View Map & Hours
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 4 — BRANDS ═══════ */}
      <section ref={brandsRef} className={`min-h-screen flex flex-col justify-center bg-graphite py-28 border-t border-white/5 ${brandsRevealClass}`}>
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">
            Trusted Partners
          </p>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Premium <span className="text-safety">Brands</span> We Carry
          </h2>
        </div>
        <div className="mt-16">
          <BrandMarquee row1Brands={VEHICLE_BRANDS} row2Brands={PART_BRAND_LOGOS} />
        </div>
      </section>

      {/* ═══════ 5 — CONTACT ═══════ */}
      <section ref={contactRef} className={`min-h-screen flex flex-col justify-center bg-graphite py-28 border-t border-white/5 ${contactRevealClass}`}>
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Get in <span className="text-safety">Touch</span>
          </h2>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            <div className="group rounded-2xl border border-muted/10 bg-chalk/5 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-safety/30">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-safety/10 text-safety transition-colors group-hover:bg-safety group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="font-sans text-xs font-semibold uppercase tracking-widest text-muted">Phone</p>
              <a href={telHref(SHOP.phonePrimary)} className="mt-3 block font-display text-xl font-bold text-white transition-colors hover:text-safety">
                {SHOP.phonePrimary}
              </a>
              <a href={telHref(SHOP.phoneSecondary)} className="mt-1 block text-base text-muted transition-colors hover:text-safety">
                {SHOP.phoneSecondary}
              </a>
            </div>

            <div className="group rounded-2xl border border-muted/10 bg-chalk/5 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-safety/30">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-safety/10 text-safety transition-colors group-hover:bg-safety group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <p className="font-sans text-xs font-semibold uppercase tracking-widest text-muted">Fax</p>
              <p className="mt-3 font-display text-xl font-bold text-white">{SHOP.fax}</p>
            </div>

            <div className="group rounded-2xl border border-muted/10 bg-chalk/5 p-8 text-left transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-safety/30">
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-safety/10 text-safety transition-colors group-hover:bg-safety group-hover:text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-sans text-xs font-semibold uppercase tracking-widest text-muted">Email</p>
              <a href={`mailto:${SHOP.email}`} className="mt-3 block font-display text-xl font-bold text-white transition-colors hover:text-safety">
                {SHOP.email}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
