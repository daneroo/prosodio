/**
 * Port of the Claude Design source `Prosodio Mark.dc.html` (project
 * 9f4e4cbd-ef67-4a7a-9712-f0483c2402be, 2026-10-07): its Tweaks (`PROPS`, the
 * variables) kept apart from its `renderVals` (the implementation), with the
 * source's names, defaults and arithmetic unchanged so the two can be diffed.
 * Only the logo itself is ported here; the lab (`/lab/logo`) ports the
 * source's boards from it, except the library mock and the construction
 * guides and readout, not ported.
 *
 * The source says "mark"; this repo says "logo" (GLOSSARY.md). Within this
 * file the source's names win.
 */

// ============================================================================
// Tweaks — the source's `data-props`, verbatim
// ============================================================================

export const PROPS = {
  scheme: {
    editor: "enum",
    options: [
      "Sepia on cream",
      "Cream on sepia",
      "Rust on midnight",
      "Midnight on rust",
    ],
    default: "Sepia on cream",
    section: "Colour",
  },
  finish: {
    editor: "enum",
    options: ["Flat", "Sheen", "Glass"],
    default: "Flat",
    section: "Colour",
  },
  waveCount: {
    editor: "enum",
    options: ["2", "3"],
    default: "3",
    section: "Mark",
  },
  waveLift: {
    editor: "range",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    section: "Mark",
  },
  waveGap: {
    editor: "range",
    min: 2,
    max: 10,
    step: 0.5,
    default: 5,
    unit: "u",
    section: "Mark",
  },
  waveWeight: {
    editor: "range",
    min: 0.5,
    max: 1.2,
    step: 0.05,
    default: 0.8,
    section: "Mark",
  },
  arcSweep: {
    editor: "range",
    min: 30,
    max: 70,
    step: 1,
    default: 48,
    unit: "°",
    section: "Mark",
  },
  opticalY: {
    editor: "range",
    min: -4,
    max: 6,
    step: 0.25,
    default: 1.5,
    unit: "%",
    section: "Tile",
  },
  opticalX: {
    editor: "range",
    min: -4,
    max: 4,
    step: 0.25,
    default: 1,
    unit: "%",
    section: "Tile",
  },
  wordmarkFont: {
    editor: "enum",
    options: ["Iowan Old Style", "Source Serif 4", "Newsreader", "Literata"],
    default: "Iowan Old Style",
    section: "Wordmark",
  },
  wordmarkWeight: {
    editor: "range",
    min: 400,
    max: 700,
    step: 50,
    default: 500,
    section: "Wordmark",
  },
  lockupGap: {
    editor: "range",
    min: 0.1,
    max: 0.4,
    step: 0.01,
    default: 0.2,
    unit: "× tile",
    section: "Wordmark",
  },
} as const;

type Tweak = (typeof PROPS)[keyof typeof PROPS];
type Value<T extends Tweak> = T extends { options: readonly (infer O)[] }
  ? O
  : number;

/** The Tweaks' values; any left out take their `PROPS` default. */
export type Props = { [K in keyof typeof PROPS]: Value<(typeof PROPS)[K]> };

// ============================================================================
// renderVals — the source's logic, verbatim apart from types
// ============================================================================

/** The construction: pilcrow in u (cap height 60u, stem 9u), waves right. */
export interface Base {
  side: "left" | "right";
  n: number;
  lift: number;
  gap: number;
  wr: number;
  theta: number;
  oy: number;
  ox: number;
  box: number;
  bb: number;
  bx: number;
  sg: number;
  top: "open" | "closed";
  li: number;
  lo: number;
}

/** One drawing: paths in u, the tile transform, the bare viewBox. */
export interface Mk {
  pil: string;
  waves: string;
  sw: number;
  tf: string;
  vb: string;
  s: number;
  tx: number;
  ty: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  bw: number;
  bh: number;
  cy: number;
  ws: number;
  c: Base;
  PR: number;
  PH: number;
}

export type SchemeKey = "paper" | "sepia" | "midnight" | "rust";

export interface Scheme {
  name: Props["scheme"];
  L: number;
  C: number;
  H: number;
  flatBg?: string;
  fg: string;
  sh: string;
  edge?: string;
  light?: boolean;
}

export type Finish = "flat" | "sheen" | "glass";

/** One tile's CSS: size and radius in px, background, logo color, shadows. */
export interface Tile {
  size: number;
  rad: number;
  bg: string;
  fg: string;
  shadow: string;
  mf: string;
  pil: string;
  waves: string;
  sw: number;
  tf: string;
  label: string;
  lc: string;
}

export const f = (v: number, d = 2) => +v.toFixed(d);

export const pilc = (c: Base) => {
  const r = c.bb / 2,
    rx = r * c.bx,
    xi = rx + 6,
    xo = xi + 9 + c.sg,
    R = xo + 9,
    H = Math.max(c.li, c.lo, c.bb);
  const bowl = `V${f(c.bb)}H${f(rx)}A${f(rx)} ${f(r)} 0 0 1 ${f(rx)} 0Z`;
  const d =
    c.top === "open"
      ? `M${f(rx)} 0H${f(xi + 9)}V${c.li}H${f(xi)}${bowl}M${f(xo)} 0H${f(R)}V${c.lo}H${f(xo)}Z`
      : `M${f(rx)} 0H${f(R)}V${c.lo}H${f(xo)}V9H${f(xi + 9)}V${c.li}H${f(xi)}${bowl}`;
  return { d, R, H, r };
};

export const S: Record<SchemeKey, Scheme> = {
  paper: {
    name: "Sepia on cream",
    L: 0.985,
    C: 0.025,
    H: 95,
    flatBg: "#fffbeb",
    fg: "#461901",
    sh: "rgba(70,25,1,.22)",
    edge: "rgba(70,25,1,.14)",
    light: true,
  },
  sepia: {
    name: "Cream on sepia",
    L: 0.29,
    C: 0.08,
    H: 45,
    flatBg: "#461901",
    fg: "#fffbeb",
    sh: "rgba(50,18,0,.4)",
  },
  midnight: {
    name: "Rust on midnight",
    L: 0.32,
    C: 0.07,
    H: 262,
    fg: "oklch(0.74 0.13 58)",
    sh: "rgba(10,20,50,.4)",
  },
  rust: {
    name: "Midnight on rust",
    L: 0.67,
    C: 0.13,
    H: 52,
    fg: "oklch(0.27 0.07 262)",
    sh: "rgba(80,40,10,.32)",
  },
};

export const ok = (L: number, C: number, H: number) =>
  `oklch(${f(Math.min(1, Math.max(0, L)), 3)} ${C} ${H})`;

export const fonts: Record<Props["wordmarkFont"], string> = {
  "Iowan Old Style": "'Iowan Old Style','Source Serif 4',Georgia,serif",
  "Source Serif 4": "'Source Serif 4',Georgia,serif",
  Newsreader: "'Newsreader',Georgia,serif",
  Literata: "'Literata',Georgia,serif",
};

/** The source's `renderVals` up to its page data: the Tweaks in, the logo's
 * builders out, each closed over `base` as there. */
export function renderVals(props: Partial<Props> = {}) {
  const p = props;
  const base: Base = {
    side: "right",
    n: +(p.waveCount ?? 3),
    lift: p.waveLift ?? 0.5,
    gap: p.waveGap ?? 5,
    wr: p.waveWeight ?? 0.8,
    theta: p.arcSweep ?? 48,
    oy: p.opticalY ?? 1.5,
    ox: p.opticalX ?? 1,
    box: 58,
    bb: 32,
    bx: 1,
    sg: 6,
    top: "closed",
    li: 60,
    lo: 60,
  };
  const mk = (o: Partial<Base> = {}): Mk => {
    const c = { ...base, ...o };
    const PC = pilc(c),
      P = PC.d,
      PR = PC.R,
      PH = PC.H;
    const ws = 9 * c.wr,
      step = ws * 1.75,
      th = (c.theta * Math.PI) / 180,
      co = Math.cos(th),
      si = Math.sin(th);
    let d = "",
      cx: number,
      cy: number,
      rn = 0,
      x0: number,
      x1: number;
    if (c.side === "left") {
      cx = 16;
      cy = 16;
      const r1 = 16 + c.gap + ws / 2;
      for (let i = 0; i < c.n; i++) {
        const r = r1 + i * step;
        rn = r;
        d += `M${f(cx - r * co)} ${f(cy - r * si)}A${f(r)} ${f(r)} 0 0 0 ${f(cx - r * co)} ${f(cy + r * si)}`;
      }
      x0 = cx - rn - ws / 2;
      x1 = 46;
    } else {
      const r1 = 9;
      cy = PH / 2 - c.lift * (PH / 2 - PC.r);
      cx = PR + c.gap + ws / 2 - r1 * co;
      for (let i = 0; i < c.n; i++) {
        const r = r1 + i * step;
        rn = r;
        d += `M${f(cx + r * co)} ${f(cy - r * si)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r * co)} ${f(cy + r * si)}`;
      }
      x0 = 0;
      x1 = cx + rn + ws / 2;
    }
    const y0 = Math.min(0, cy - rn * si - ws / 2),
      y1 = Math.max(PH, cy + rn * si + ws / 2);
    const bw = x1 - x0,
      bh = y1 - y0,
      s = Math.min(c.box / bw, c.box / bh);
    const oy = c.side === "left" ? c.oy + 1.5 : c.oy,
      ox = c.side === "left" ? -c.ox : c.ox;
    const tx = 50 - (s * (x0 + x1)) / 2 + ox,
      ty = 50 - (s * (y0 + y1)) / 2 + oy;
    return {
      pil: P,
      waves: d,
      sw: f(ws),
      tf: `translate(${f(tx)} ${f(ty)}) scale(${f(s, 4)})`,
      vb: `${f(x0 - 0.5)} ${f(y0)} ${f(bw + 1)} ${f(bh)}`,
      s,
      tx,
      ty,
      x0,
      x1,
      y0,
      y1,
      bw,
      bh,
      cy,
      ws,
      c,
      PR,
      PH,
    };
  };
  const fin0: Finish =
    (
      {
        Flat: "flat",
        Sheen: "sheen",
        Glass: "glass",
      } as const satisfies Record<Props["finish"], Finish>
    )[p.finish ?? "Flat"] || "flat";
  const tile = (
    m: Mk,
    size: number,
    scheme: SchemeKey = "paper",
    extra: Partial<Tile> = {},
    finish: Finish = fin0,
  ): Tile => {
    const sc = S[scheme],
      { L, C, H } = sc;
    const up = sc.light ? 0.012 : 0.07,
      dn = sc.light ? 0.045 : 0.06;
    const flat = sc.flatBg || ok(L, C, H);
    const sheen = `radial-gradient(140% 110% at 22% 0%, ${ok(L + up, C, H)} 0%, ${ok(L, C, H)} 50%, ${ok(L - dn, C, H)} 100%)`;
    const bg =
      finish === "flat"
        ? flat
        : finish === "sheen"
          ? sheen
          : `linear-gradient(172deg, rgba(255,255,255,${sc.light ? 0.7 : 0.26}) 0%, rgba(255,255,255,${sc.light ? 0.25 : 0.07}) 46%, rgba(255,255,255,0) 47%), ${sheen}`;
    const out = `0 ${f(Math.max(1, size * 0.01))}px ${f(Math.max(1, size * 0.02))}px rgba(0,0,0,.1), 0 ${f(size * 0.06)}px ${f(size * 0.16)}px -${f(size * 0.06)}px ${sc.sh}`;
    const edge = sc.edge ? `, 0 0 0 1px ${sc.edge}` : "";
    const inner =
      finish === "flat"
        ? ""
        : `, inset 0 ${f(Math.max(0.5, size * 0.008))}px 0 rgba(255,255,255,${sc.light ? 0.9 : 0.28}), inset 0 -${f(Math.max(0.5, size * 0.012))}px ${f(size * 0.03)}px rgba(0,0,0,${sc.light ? 0.06 : 0.22})`;
    const mf =
      finish === "flat" || size < 32
        ? "none"
        : sc.light
          ? `drop-shadow(0 ${f(size * 0.008)}px 0 rgba(255,255,255,.9))`
          : `drop-shadow(0 ${f(size * 0.008)}px ${f(size * 0.01)}px rgba(0,0,0,.3))`;
    return {
      size,
      rad: f(size * 0.225),
      bg,
      fg: sc.fg,
      shadow: out + edge + inner,
      mf,
      pil: m.pil,
      waves: m.waves,
      sw: m.sw,
      tf: m.tf,
      label: `${size}px`,
      lc: "#8a8992",
      ...extra,
    };
  };
  const schemeKey: SchemeKey =
    (
      {
        "Sepia on cream": "paper",
        "Cream on sepia": "sepia",
        "Rust on midnight": "midnight",
        "Midnight on rust": "rust",
      } as const satisfies Record<Props["scheme"], SchemeKey>
    )[p.scheme ?? "Sepia on cream"] || "paper";
  const small = (size: number, o: Partial<Base> = {}) =>
    size <= 24
      ? mk({
          n: Math.min(2, base.n),
          wr: Math.max(base.wr, 0.95),
          box: 64,
          ...o,
        })
      : mk(o);

  const font =
    fonts[p.wordmarkFont ?? "Iowan Old Style"] || fonts["Iowan Old Style"];
  const weight = p.wordmarkWeight ?? 500;
  const lg = p.lockupGap ?? 0.2;
  const M = mk();
  const lock = (m: Mk, size: number, scheme: SchemeKey, tag = true) => ({
    t: tile(m, size, scheme),
    gap: f(size * lg),
    fs: f(size * (tag ? 0.5 : 0.52)),
    tfs: f(size * 0.13),
    tgap: f(size * 0.07),
  });

  return { base, mk, fin0, tile, schemeKey, small, font, weight, lg, M, lock };
}

// ============================================================================
// Turn 3 · In-app bar — the chosen 3b: bare logo at 24px, no tile
// ============================================================================

/** 3b's amber: the logo in the app (and, later, its accent). */
export const amber = "oklch(0.8 0.125 68)";

/** 3b's wordmark settings; its font (`wmFont`) is `renderVals().font`, the
 * `wordmarkFont` Tweak. Cream (`wm`), `lgap` px from the logo. */
export const serif = {
  wmWeight: 600,
  wmSize: 19,
  wmTrack: "-.01em",
  lgap: 7,
} as const;

/** 3b's wordmark color. */
export const wm = "#fffbeb";
