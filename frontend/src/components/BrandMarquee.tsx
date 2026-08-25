/**
 * Two rows of brand logos drifting in opposite directions.
 * Row 1 scrolls right, Row 2 scrolls left.
 * Each brand is rendered as a clean white square tile with the logo image.
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
}: {
  brands: BrandItem[];
  direction: 'left' | 'right';
}) {
  // Triple to ensure seamless looping
  const tripled = [...brands, ...brands, ...brands];
  return (
    <div
      className="flex w-max"
      style={{
        animation: `marquee-${direction} 220s linear infinite`,
      }}
    >
      {tripled.map((brand, i) => (
        <div
          key={`${brand.id}-${i}`}
          className="group mx-3 flex h-32 w-44 shrink-0 items-center justify-center rounded-sm border border-white/[0.06] bg-white/[0.03] px-6 backdrop-blur-sm transition-all duration-500 ease-out hover:border-safety/30 hover:bg-white/10 hover:shadow-[0_0_30px_-8px_rgba(255,90,31,0.35)]"
        >
          {brand.logo ? (
            <img
              src={brand.logo}
              alt={brand.name}
              className="h-16 w-auto max-w-[110px] object-contain opacity-60 grayscale transition-all duration-500 ease-out group-hover:opacity-100 group-hover:grayscale-0"
            />
          ) : (
            <span className="font-display text-lg font-black tracking-widest text-white/30 text-center uppercase transition-colors duration-500 group-hover:text-white/80">
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
  row2Brands
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
      className="overflow-hidden"
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}
    >
      {r1.length > 0 && <Row brands={r1} direction="right" />}
      {r2.length > 0 && <Row brands={r2} direction="left" />}
    </div>
  );
}
