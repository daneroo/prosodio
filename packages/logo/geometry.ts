/**
 * The logo's geometry: a pilcrow with sound-wave arcs radiating to its right
 * (README.md: what it means). Units are u, the construction unit: the pilcrow
 * is 60u tall, a stem 9u wide; y points down (0 = top, 60 = baseline).
 *
 * Settled in Claude Design (`Prosodio Mark.dc.html`); its names in brackets.
 * The tests pin this to that source's own output.
 */

/** The pilcrow, locked (turn 4): bowl, stems, gap and legs were each studied
 * and the original drawing kept. */
export const PILCROW = {
  /** Cap height: the top bar to the foot of both legs (`li`, `lo`). */
  height: 60,
  /** Stem width, also the top bar's thickness. */
  stem: 9,
  /** Bowl height (`bb`): a half circle of radius 16. */
  bowl: 32,
  /** Flat run from the bowl's half circle to the inner stem. */
  bowlNeck: 6,
  /** Gap between the two stems (`sg`). */
  stemGap: 6,
} as const;

/** The arcs: the variables the studies vary. */
export interface LogoParams {
  /** Number of arcs (`waveCount`). */
  arcCount: number;
  /** Arcs' centre height, 0 = stem midpoint (30u), 1 = bowl centre (16u)
   * (`waveLift`). */
  arcHeight: number;
  /** Gap from the pilcrow to the first arc, in u (`waveGap`). */
  arcGap: number;
  /** Arc stroke, × stem width (`waveWeight`). */
  arcWeight: number;
  /** Half the angle each arc spans, in degrees (`arcSweep`). */
  arcSweep: number;
}

/** The settled values. */
export const LOGO_DEFAULTS: LogoParams = {
  arcCount: 3,
  arcHeight: 0.5,
  arcGap: 5,
  arcWeight: 0.8,
  arcSweep: 48,
};

/** The arcs' fixed proportions. */
export const ARC = {
  /** Radius of the first (innermost) arc, in u. */
  firstRadius: 9,
  /** Distance between successive arcs, × arc stroke. */
  spacing: 1.75,
} as const;

/** One drawing of the logo, in u. */
export interface Logo {
  /** SVG path: the pilcrow's outline, to fill. */
  pilcrow: string;
  /** SVG path: the arcs' centre lines, to stroke with round caps. */
  arcs: string;
  /** Number of arcs drawn. */
  arcCount: number;
  /** Arc stroke width. */
  arcStroke: number;
  /** Common centre of the arcs. */
  arcCenter: { x: number; y: number };
  /** Everything drawn, stroke included. */
  box: { left: number; top: number; right: number; bottom: number };
}

/** The logo drawn with `params` (any left out take `LOGO_DEFAULTS`). */
export function drawLogo(params: Partial<LogoParams> = {}): Logo {
  const { arcCount, arcHeight, arcGap, arcWeight, arcSweep } = {
    ...LOGO_DEFAULTS,
    ...params,
  };
  const { height, stem, bowl, bowlNeck, stemGap } = PILCROW;

  // Pilcrow, left to right: bowl (half circle + neck), inner stem, gap,
  // outer stem; the top bar joins them.
  const bowlRadius = bowl / 2;
  const innerStem = bowlRadius + bowlNeck;
  const outerStem = innerStem + stem + stemGap;
  const right = outerStem + stem;
  const pilcrow = `M${round(bowlRadius)} 0H${round(right)}V${height}H${round(outerStem)}V${stem}H${round(innerStem + stem)}V${height}H${round(innerStem)}V${round(bowl)}H${round(bowlRadius)}A${round(bowlRadius)} ${round(bowlRadius)} 0 0 1 ${round(bowlRadius)} 0Z`;

  // Arcs: concentric, each spanning ±arcSweep about the horizontal. The
  // first arc's ends sit arcGap (plus half a stroke) right of the pilcrow.
  const arcStroke = stem * arcWeight;
  const step = arcStroke * ARC.spacing;
  const angle = (arcSweep * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cy = height / 2 - arcHeight * (height / 2 - bowlRadius);
  const cx = right + arcGap + arcStroke / 2 - ARC.firstRadius * cos;
  let arcs = "";
  let outerRadius = 0;
  for (let i = 0; i < arcCount; i++) {
    const r = ARC.firstRadius + i * step;
    outerRadius = r;
    arcs += `M${round(cx + r * cos)} ${round(cy - r * sin)}A${round(r)} ${round(r)} 0 0 1 ${round(cx + r * cos)} ${round(cy + r * sin)}`;
  }

  return {
    pilcrow,
    arcs,
    arcCount,
    arcStroke: round(arcStroke),
    arcCenter: { x: cx, y: cy },
    box: {
      left: 0,
      top: Math.min(0, cy - outerRadius * sin - arcStroke / 2),
      right: cx + outerRadius + arcStroke / 2,
      bottom: Math.max(height, cy + outerRadius * sin + arcStroke / 2),
    },
  };
}

/** Rounds to `digits` decimals, as written into paths (the source's `f`). */
export function round(value: number, digits = 2): number {
  return +value.toFixed(digits);
}

/** The bare logo's SVG viewBox: its box, with 0.5u either side. */
export function bareViewBox(logo: Logo): string {
  const { left, top, right, bottom } = logo.box;
  return `${round(left - 0.5)} ${round(top)} ${round(right - left + 1)} ${round(bottom - top)}`;
}
