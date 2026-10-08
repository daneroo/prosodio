/**
 * Board 5 · Icons: the generated files themselves, as served from `public/`
 * (names and sizes from `ICONS`, @prosodio/logo), each at its natural pixel
 * size on a white and a dark card; the small ones also enlarged, unsmoothed,
 * so their pixels can be judged. An <img> shows one frame of favicon.ico,
 * the browser's pick.
 */
import { ICONS, PNG_ICONS } from "@prosodio/logo";

import { Board, Card, MONO } from "./board";

/** Enlarge files at or below the favicon's largest frame, to judge their
 * pixels. */
const ENLARGE_MAX_PX = Math.max(...ICONS.favicon.sizes);
/** The enlarged size, px. */
const ENLARGED_PX = 128;

/** Every file shown: the .ico at its largest frame, then the PNGs. */
const FILES: ReadonlyArray<{ file: string; size: number }> = [
  { file: ICONS.favicon.file, size: ENLARGE_MAX_PX },
  ...PNG_ICONS,
];

export function IconsBoard() {
  return (
    <Board number={5} open={false} title="Icons">
      <div className="text-[11px] text-[#6b6a72]" style={{ fontFamily: MONO }}>
        the generated files in public/ · {ICONS.favicon.file} holds{" "}
        {ICONS.favicon.sizes.join(" + ")} px frames; an img shows one, the
        browser&apos;s pick
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[false, true].map((dark) => (
          <Card
            key={String(dark)}
            dark={dark}
            label={dark ? "dark" : "light"}
            className="flex flex-col gap-8 p-6"
          >
            <div className="flex flex-wrap items-end gap-8">
              {FILES.map(({ file, size }) => (
                <Icon key={file} file={file} size={size} dark={dark} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Board>
  );
}

function Icon({
  file,
  size,
  dark,
}: {
  file: string;
  size: number;
  dark: boolean;
}) {
  const label = `${file} · ${size} px`;
  return (
    <div className="flex flex-col gap-2">
      <img src={`/${file}`} width={size} height={size} alt={label} />
      {size <= ENLARGE_MAX_PX && (
        <img
          src={`/${file}`}
          width={ENLARGED_PX}
          height={ENLARGED_PX}
          alt={`${label}, enlarged`}
          style={{ imageRendering: "pixelated" }}
        />
      )}
      <span
        className={`text-[10px] tabular-nums ${dark ? "text-slate-400" : "text-[#6b6a72]"}`}
        style={{ fontFamily: MONO }}
      >
        {label}
      </span>
    </div>
  );
}
