/**
 * TEMPORARY (spec #25): the bun-one prototype's `LogoSM` (`Logo.tsx`, through
 * `fa86449be`), ported verbatim — font glyphs, so it renders differently per
 * device. A judging reference for colors and for the path drawing (`LogoSM`);
 * removed once that drawing is deemed adequate.
 *
 * Renders exactly two glyphs. "(" renders as left-facing arcs, ")" as
 * right-facing arcs. Both glyphs meet at CENTER_X with an adjustable gap:
 * - left glyph: right edge anchored at (CENTER_X - gap/2)
 * - right glyph: left edge anchored at (CENTER_X + gap/2)
 * Fills its box (`h-full w-full`), as in the prototype's containers.
 */
export type LogoGlyphs = "¶)" | "¶♫" | "¶♪" | "(¶" | ")¶";
// Note: "¶)" is the default

export function LogoSMOrig({
  glyphs = "¶)",
  gap = 3,
}: {
  glyphs?: LogoGlyphs;
  gap?: number;
}) {
  const CENTER_X = 50;
  const leftGlyph = glyphs[0]!;
  const rightGlyph = glyphs[1]!;
  const leftEdge = CENTER_X - gap / 2;
  const rightEdge = CENTER_X + gap / 2;

  // Arc geometry: paths at x=0, 8, 16 with strokeWidth=6
  const ARCS_VISUAL_WIDTH = 21;
  // Kerning offset - shift arcs for tighter spacing (positive = closer to text)
  const ARCS_OFFSET = 6;

  const renderGlyphs = () => (
    <>
      {/* Left glyph - anchored by its RIGHT edge at leftEdge */}
      {leftGlyph === ")" ? (
        renderArcs(leftEdge - ARCS_VISUAL_WIDTH - ARCS_OFFSET, 50, false)
      ) : leftGlyph === "(" ? (
        renderArcs(leftEdge - ARCS_OFFSET, 50, true)
      ) : (
        <text
          x={leftEdge}
          y="50"
          fontSize="50"
          fill="currentColor"
          textAnchor="end"
          dominantBaseline="central"
        >
          {leftGlyph}
        </text>
      )}

      {/* Right glyph - anchored by its LEFT edge at rightEdge */}
      {rightGlyph === ")" ? (
        renderArcs(rightEdge + ARCS_OFFSET, 50, false)
      ) : rightGlyph === "(" ? (
        renderArcs(rightEdge + ARCS_VISUAL_WIDTH + ARCS_OFFSET, 50, true)
      ) : (
        <text
          x={rightEdge}
          y="50"
          fontSize="50"
          fill="currentColor"
          textAnchor="start"
          dominantBaseline="central"
        >
          {rightGlyph}
        </text>
      )}
    </>
  );

  return (
    // Font family/weight via Tailwind classes for consistent styling
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full font-sans font-bold"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {renderGlyphs()}
    </svg>
  );
}

/**
 * Render broadcast arcs as SVG paths.
 * @param x - X position where arcs start (left edge for right-facing, right edge for left-facing)
 * @param y - Y center position
 * @param mirror - If true, arcs face left (mirrored)
 */
function renderArcs(x: number, y: number, mirror: boolean = false) {
  const transform = mirror
    ? `translate(${x}, ${y}) scale(-1, 1)`
    : `translate(${x}, ${y})`;

  return (
    <g transform={transform}>
      <g
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      >
        {/* Evenly spaced arcs: 0, 8, 16 (gaps of 8) */}
        <path d="M 0 -10 A 15 15 0 0 1 0 10" />
        <path d="M 8 -15 A 25 25 0 0 1 8 15" />
        <path d="M 16 -20 A 35 35 0 0 1 16 20" />
      </g>
    </g>
  );
}
