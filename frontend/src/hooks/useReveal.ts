import { useEffect, useRef, useState } from 'react';

/**
 * Fades/slides a section in once it crosses into the viewport. One-shot
 * (unobserves after first reveal) so re-scrolling past a section doesn't
 * re-trigger it. `prefers-reduced-motion` is handled globally in
 * index.css, which collapses the transition duration to ~0 — the element
 * still ends up visible, it just doesn't animate.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { sectionRef: ref, className: visible ? 'reveal reveal-visible' : 'reveal' };
}
