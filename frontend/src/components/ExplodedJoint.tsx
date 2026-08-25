/**
 * The hero's signature visual: an exploded-view diagram of a U-joint —
 * the shop's actual specialty (see PLAN.md's GMB U-joint ingestion). A
 * blueprint-style line drawing reads as "real parts catalogue," not a
 * stock photo of a car, and needs no external image asset.
 */
export function ExplodedJoint({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 460"
      fill="none"
      className={className}
      role="img"
      aria-label="Exploded diagram of a U-joint — yoke, cross, and bearing caps"
    >
      {/* alignment lines, like an assembly drawing */}
      <line x1="210" y1="76" x2="210" y2="150" stroke="#8b8d93" strokeWidth="1.5" strokeDasharray="4 6" />
      <line x1="210" y1="300" x2="210" y2="378" stroke="#8b8d93" strokeWidth="1.5" strokeDasharray="4 6" />

      {/* top yoke (fork), opening downward */}
      <g stroke="#1c1d1f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="#f2f1ed">
        <path d="M140 20 h140 a10 10 0 0 1 10 10 v18 a10 10 0 0 1-10 10 H150 a10 10 0 0 1-10-10 V30 a10 10 0 0 1 10-10Z" />
        <path d="M155 58 v54 a14 14 0 0 0 14 14 h0" />
        <path d="M265 58 v54 a14 14 0 0 0-14 14 h0" />
      </g>

      {/* cross / spider, exploded in the middle */}
      <g>
        <path
          d="M210 150 v54 M210 258 v42 M172 200 h-38 M248 200 h38"
          stroke="#1c1d1f"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <circle cx="210" cy="150" r="20" fill="#ff5a1f" stroke="#1c1d1f" strokeWidth="2.5" />
        <circle cx="210" cy="300" r="20" fill="#ff5a1f" stroke="#1c1d1f" strokeWidth="2.5" />
        <circle cx="122" cy="200" r="20" fill="#ff5a1f" stroke="#1c1d1f" strokeWidth="2.5" />
        <circle cx="298" cy="200" r="20" fill="#ff5a1f" stroke="#1c1d1f" strokeWidth="2.5" />
        <circle cx="210" cy="225" r="30" fill="#f2f1ed" stroke="#1c1d1f" strokeWidth="2.5" />
        <circle cx="210" cy="225" r="6" fill="#f4c430" />
      </g>

      {/* bottom yoke (fork), opening upward, rotated 90° like a real joint */}
      <g stroke="#1c1d1f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="#f2f1ed">
        <path d="M140 412 h140 a10 10 0 0 0 10-10 v-18 a10 10 0 0 0-10-10 H150 a10 10 0 0 0-10 10 v18 a10 10 0 0 0 10 10Z" />
        <path d="M155 374 v-54 a14 14 0 0 1 14-14 h0" />
        <path d="M265 374 v-54 a14 14 0 0 1-14-14 h0" />
      </g>

      {/* part-tag callout, ties the drawing back to the real catalogue */}
      <g transform="translate(300 34)">
        <rect x="0" y="0" width="92" height="26" rx="2" fill="#1c1d1f" />
        <rect x="0" y="0" width="3" height="26" fill="#ff5a1f" />
        <text x="12" y="17" fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize="12" fill="#f2f1ed">
          GUT12
        </text>
      </g>
    </svg>
  );
}
