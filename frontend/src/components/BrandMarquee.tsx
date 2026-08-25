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
        animation: `marquee-${direction} 80s linear infinite`,
      }}
    >
      {tripled.map((brand, i) => (
        <div
          key={`${brand.id}-${i}`}
          className="group flex h-36 w-48 shrink-0 items-center justify-center border border-muted/10 bg-white/80 px-6 transition-all duration-300 hover:bg-white hover:shadow-xl hover:scale-[1.05] hover:z-10"
        >
          {brand.logo ? (
            <img
              src={brand.logo}
              alt={brand.name}
              className="h-20 w-auto max-w-[120px] object-contain transition-all duration-300"
            />
          ) : (
            <span className="font-display text-lg font-black tracking-widest text-graphite/40 text-center uppercase transition-colors duration-300 group-hover:text-graphite/80">
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
