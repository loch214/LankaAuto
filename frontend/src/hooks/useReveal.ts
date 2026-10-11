import { useEffect, useRef, useState } from 'react';

/**
 * Fades/slides a section in whenever it crosses into the viewport, and
 * fades it back out when it leaves — repeatable (does not unobserve), so
 * on a full-page scroll-snap layout (landing page) each section replays
 * the animation every time the user snaps to it, in either scroll
 * direction. `prefers-reduced-motion` is handled globally in index.css,
 * which collapses the transition duration to ~0 — the element still ends
 * up visible, it just doesn't animate.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    // Low threshold on purpose: on phones the landing sections are no longer
    // forced to one screen tall, and a section much taller than the screen
    // can never be 35% visible at once — at the old 0.35 it would never
    // reveal and just stay invisible.
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { sectionRef: ref, className: visible ? 'reveal reveal-visible' : 'reveal' };
}
