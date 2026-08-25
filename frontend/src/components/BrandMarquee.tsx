/**
 * Two rows of brand logos drifting slowly in opposite directions.
 * Row 1 scrolls right, Row 2 scrolls left, at slightly different speeds so the
 * rows never lock into step with each other.
 *
 * The logo source images are white-background JPGs, so each tile is a white
 * card — the image's own background merges into the card seamlessly instead of
 * reading as a white rectangle floating inside a darker one.
 *
 * Hovering a row pauses it so a logo can actually be read.
 * Edges fade via a CSS mask for a seamless look.
 */

interface BrandItem {
  id: string;
  name: string;
  logo?: string;
}

function Row({
  brands,
  direction,
  duration,
  padding,
}: {
  brands: BrandItem[];
  direction: 'left' | 'right';
  duration: number;
  /** Tile padding — tighter for square logo art, see BrandMarquee below. */
  padding: string;
}) {
  // Exactly two copies: the keyframes translate 50%, so 2x loops seamlessly.
  const doubled = [...brands, ...brands];
  return (
    <div
      className="flex w-max hover:[animation-play-state:paused]"
      // Longhands, not the `animation` shorthand: the shorthand would reset
      // animation-play-state to `running` and, being inline, would beat the
      // hover class that pauses the row.
      style={{
        animationName: `marquee-${direction}`,
        animationDuration: `${duration}s`,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      }}
    >
      {doubled.map((brand, i) => (
        <div
          key={`${brand.id}-${i}`}
          className={`group mx-3 flex h-28 w-48 shrink-0 items-center justify-center rounded-xl bg-white ${padding} shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition-all duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_16px_36px_-10px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,90,31,0.55)]`}
        >
          {brand.logo ? (
            <img
              src={brand.logo}
              alt={brand.name}
              className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <span className="text-center font-display text-lg font-black uppercase tracking-widest text-graphite/70 transition-colors duration-500 group-hover:text-graphite">
              {brand.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function BrandMarquee({
  brands,
  row1Brands,
  row2Brands,
}: {
  brands?: BrandItem[];
  row1Brands?: BrandItem[];
  row2Brands?: BrandItem[];
}) {
  const r1 = row1Brands || brands || [];
  const r2 = row2Brands || brands || [];

  if (r1.length === 0 && r2.length === 0) return null;

  return (
    <div
      // py- gives the hover lift room to breathe without being clipped,
      // space-y- keeps the two rows from colliding.
      className="space-y-6 overflow-hidden py-8"
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}
    >
      {/*
        Row 1's vehicle logos are square (300x300) so object-contain caps them
        at the tile's inner *height* — they need tighter vertical padding to
        render at a comparable size. Row 2's part logos are 2:1 and already
        fill their tile.
      */}
      {r1.length > 0 && <Row brands={r1} direction="right" duration={190} padding="px-5 py-2.5" />}
      {r2.length > 0 && <Row brands={r2} direction="left" duration={240} padding="px-7 py-6" />}
    </div>
  );
}
