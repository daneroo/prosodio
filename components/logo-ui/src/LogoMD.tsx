import type { SVGProps } from "react";

/** One staff position (line or space) per note glyph: φ ♫ a ξ. */
export type StaffNotes = readonly [number, number, number, number];

/**
 * The staff logo (MD): the pilcrow as clef at the head of a staff, with φ ♫ a ξ
 * as font glyphs on its lines and spaces. Ported from the bun-one prototype
 * (`Logo.tsx` `LogoMD`); the defaults are its MD-0: five lines between y 30 and
 * 70, notes at positions `[6, 3, 5, 2]`. Deterministic: random notes are a
 * lab-only concern. Fills its box (`h-full w-full`), as the prototype did
 * inside its container; one color, `currentColor`.
 */
export function LogoMD({
  staffLines = 5,
  notesYs = [6, 3, 5, 2],
  minY = 30,
  maxY = 70,
  title,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  staffLines?: number;
  /** Staff position index (lines and spaces, top to bottom) of each note. */
  notesYs?: StaffNotes;
  minY?: number;
  maxY?: number;
  title?: string;
}) {
  const allPositions = getStaffYs(staffLines, minY, maxY);
  const midY = allPositions[Math.floor(allPositions.length / 2)] ?? 50;
  const noteY = (index: number) => allPositions[index] ?? midY;

  const glyphs = [
    { glyph: "¶", x: 21, y: midY },
    { glyph: "φ", x: 40, y: noteY(notesYs[0]) },
    { glyph: "♫", x: 55, y: noteY(notesYs[1]) },
    { glyph: "a", x: 70, y: noteY(notesYs[2]) },
    { glyph: "ξ", x: 85, y: noteY(notesYs[3]) },
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={`h-full w-full font-sans font-bold ${className ?? ""}`.trim()}
      {...props}
    >
      {title && <title>{title}</title>}
      {/* Staff lines: only on line positions (even indices) */}
      {allPositions
        .filter((_, index) => index % 2 === 0)
        .map((y) => (
          <line
            key={y}
            x1="10"
            y1={y}
            x2="90"
            y2={y}
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.7"
          />
        ))}

      {glyphs.map((g) => (
        <text
          key={g.glyph}
          x={g.x}
          y={g.y}
          fontSize={g.glyph === "¶" ? "32" : "18"}
          fill="currentColor"
          // middle (not central) aligns better with the staff
          dominantBaseline="middle"
          textAnchor="middle"
        >
          {g.glyph}
        </text>
      ))}
    </svg>
  );
}

/** All Y positions (lines and spaces) of a staff, top to bottom. */
function getStaffYs(lineCount: number, minY: number, maxY: number): number[] {
  if (lineCount <= 0) return [];
  if (lineCount === 1) return [minY];

  const totalPositions = staffPositionCount(lineCount);
  const step = (maxY - minY) / (totalPositions - 1);
  return Array.from({ length: totalPositions }, (_, i) => minY + i * step);
}

/** Number of staff positions (lines and spaces) for a line count. */
export function staffPositionCount(staffLines: number): number {
  return staffLines <= 1 ? Math.max(0, staffLines) : staffLines * 2 - 1;
}
