import { useEffect } from 'react';
import Lenis from 'lenis';

// Lenis drives the actual native scroll position (window.scrollY), it just
// eases how wheel/touch input gets there — so useReveal's IntersectionObserver
// and framer-motion's useScroll (both window-scroll-based) keep working
// unmodified. Mounted once in Layout.tsx, not per-page.
export function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
}
