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

const FEATURED_PART_BRANDS = [
  { id: 'p1', name: 'Part 1', logo: '/images/brands/parts/1.jpg' },
  { id: 'p2', name: 'Part 2', logo: '/images/brands/parts/2.jpg' },
  { id: 'p3', name: 'Part 3', logo: '/images/brands/parts/3.jpg' },
  { id: 'p4', name: 'Part 4', logo: '/images/brands/parts/4.jpg' },
  { id: 'p5', name: 'Part 5', logo: '/images/brands/parts/5.jpg' },
  { id: 'p6', name: 'Part 6', logo: '/images/brands/parts/6.jpg' },
  { id: 'p7', name: 'Part 7', logo: '/images/brands/parts/7.jpg' },
  { id: 'p8', name: 'Part 8', logo: '/images/brands/parts/8.jpg' },
  { id: 'p9', name: 'Part 9', logo: '/images/brands/parts/9.jpg' },
];

const SLIDER_IMAGES = [
  '/images/slider/slide1.jpg',
  '/images/slider/slide2.jpg',
  '/images/slider/slide3.jpg',
  '/images/slider/slide4.jpg',
  '/images/slider/slide5.jpg',
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
      setCurrentPartSlide((prev) => (prev + 1) % FEATURED_PART_BRANDS.length);
    }, 3000);
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
              className={`absolute inset-0 transition-opacity duration-[2000ms] ease-in-out ${
                i === currentSlide ? 'opacity-50' : 'opacity-0'
              }`}
            >
              <img
                src={src}
                alt=""
                className={`h-full w-full object-cover ${i === currentSlide ? 'animate-[ken-burns_10s_ease-out_forwards]' : ''}`}
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
      <section ref={browseRef} className={`relative z-20 overflow-hidden bg-graphite/80 ${browseRevealClass}`}>
        <div className="grid lg:grid-cols-2 h-[600px]">
          {/* Left Side: Parts Image Slider */}
          <div className="relative h-[400px] lg:h-full overflow-hidden bg-black/50">
            {FEATURED_PART_BRANDS.map((part, i) => (
              <div
                key={part.id}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out flex items-center justify-center p-12 ${
                  i === currentPartSlide ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <img
                  src={part.logo}
                  alt={part.name}
                  className={`h-full w-full object-contain filter drop-shadow-2xl transition-transform duration-[3000ms] ease-out ${
                    i === currentPartSlide ? 'scale-110' : 'scale-100'
                  }`}
                />
              </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-graphite to-transparent opacity-40" />
          </div>

          {/* Right Side: Text & Button */}
          <div className="flex flex-col justify-center px-8 py-20 sm:px-16 lg:py-32 border-l border-white/5 bg-gradient-to-br from-graphite to-graphite/50 backdrop-blur-md">
            <h2 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl leading-tight">
              Explore the Full <br/><span className="text-safety">Catalogue</span>
            </h2>
            <p className="mt-6 max-w-md text-lg text-chalk/70 leading-relaxed">
              Engine parts, gearbox parts, brake parts, shock absorbers, electrical parts, lights & mirrors, body parts — all from trusted Japanese brands. We have precisely what you need.
            </p>
            <div className="mt-10">
              <Link to="/browse" className="btn-premium inline-flex w-auto">
                Browse Items
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4 ml-1"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ 3 — STORE TEASER ═══════ */}
      <section ref={visitRef} className={`overflow-hidden bg-graphite text-chalk ${visitRevealClass}`}>
        <div className="grid lg:grid-cols-2">
          <div className="relative h-[400px] lg:h-auto">
            <img
              src="/images/store-front.jpg"
              alt="LankaAuto Storefront"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-graphite/90 to-transparent lg:bg-gradient-to-l lg:from-transparent lg:to-graphite" />
          </div>
          <div className="flex flex-col justify-center px-8 py-20 sm:px-16 lg:py-32">
            <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">
              Our Flagship Store
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Experience the<br />difference in person
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-chalk/60">
              Bring the part number, the old part, or just tell us the vehicle — staff will pull it straight off the rack.
            </p>
            <p className="mt-4 text-sm font-medium text-chalk/80">
              {shopAddress}
            </p>
            <div className="mt-10">
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
      <section ref={brandsRef} className={`bg-graphite py-28 border-t border-white/5 ${brandsRevealClass}`}>
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">
            Trusted Partners
          </p>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Premium <span className="text-safety">Brands</span> We Carry
          </h2>
        </div>
        <div className="mt-16">
          <BrandMarquee row1Brands={VEHICLE_BRANDS} row2Brands={FEATURED_PART_BRANDS} />
        </div>
      </section>

      {/* ═══════ 5 — CONTACT ═══════ */}
      <section ref={contactRef} className={`bg-graphite py-28 border-t border-white/5 ${contactRevealClass}`}>
        <div className="mx-auto max-w-5xl px-4 text-center">
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.3em] text-safety/80">
            Get in Touch
          </p>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Questions before you drive over?
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
