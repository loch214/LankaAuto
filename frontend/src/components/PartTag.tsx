/**
 * The brand's signature element: a part code rendered like a stenciled
 * shelf label — the physical object every price-list row and every rack in
 * the shop is organized around. Used everywhere a part number appears
 * (hero, browse list, detail page) so the identity is built from the real
 * product data, not a decorative flourish layered on top of it.
 *
 * Self-contained (own background), so it reads the same on the dark hero
 * and the light browse page without a separate light/dark variant.
 */
export function PartTag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border-l-2 border-safety bg-graphite px-2 py-0.5 font-mono text-xs tracking-wider text-chalk">
      {children}
    </span>
  );
}
