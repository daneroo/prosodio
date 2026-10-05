import { HERO_OPENINGS } from "./openings.ts";

/** Line height in em units for the ruled-paper effect. */
const LINE_HEIGHT = 1.75;
/** Staff line thickness in px. */
const LINE_WIDTH = 2;
/** Number of text lines. */
const NUM_LINES = 4;

/**
 * The hero logo: the pilcrow as clef at the head of a ruled page, with a
 * book's opening lines justified on the staff. Ported from the bun-one
 * prototype (`Logo.tsx` `LogoHero`, through `fa86449be`): staff lines via a
 * repeating gradient clipped by the outer box, five visible (one at the top,
 * one after each text line).
 *
 * Deliberate "physical paper" colors, independent of the page it sits on:
 * cream paper and brown ink (amber-50, amber-950), or warm charcoal and warm
 * gray (stone-950, stone-200) inside a `data-theme="dark"` ancestor, the
 * prototype's dark-mode switch.
 */
export function LogoHero({
  text = HERO_OPENINGS.nameOfTheWind.text,
}: {
  text?: string;
}) {
  return (
    // Outer box clips the gradient to exactly NUM_LINES rows + the top line
    // (4rem: the p-8 padding).
    // text-2xl: the flowing text; text-[8rem]: the pilcrow clef.
    <div
      className="w-full max-w-2xl overflow-hidden rounded-3xl bg-amber-50 p-8 text-2xl text-amber-950 shadow-xl shadow-stone-900/10 in-data-[theme=dark]:bg-stone-950 in-data-[theme=dark]:text-stone-200"
      style={{
        maxHeight: `calc(${LINE_HEIGHT}em * ${NUM_LINES} + ${LINE_WIDTH}px + 4rem)`,
      }}
    >
      {/* Two stacked staff gradients, as in the prototype (the outer one
          always amber-950; the inner one follows the paper): together they
          set the lines' weight. */}
      <div
        className="flex items-stretch gap-4"
        style={{
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            rgb(from var(--color-amber-950) r g b / 0.3) 0,
            rgb(from var(--color-amber-950) r g b / 0.3) ${LINE_WIDTH}px,
            transparent ${LINE_WIDTH}px,
            transparent ${LINE_HEIGHT}em
          )`,
        }}
      >
        <div
          className="flex grow items-stretch gap-4 [--line-color:rgba(69,26,3,0.3)] in-data-[theme=dark]:[--line-color:rgba(231,229,228,0.3)]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              var(--line-color) 0,
              var(--line-color) ${LINE_WIDTH}px,
              transparent ${LINE_WIDTH}px,
              transparent ${LINE_HEIGHT}em
            )`,
            minHeight: `calc(${LINE_HEIGHT}em * ${NUM_LINES} + ${LINE_WIDTH}px)`,
          }}
        >
          {/* Pilcrow clef: fixed size, vertically centered, nudged up */}
          <span className="-mt-6 shrink-0 self-center font-sans text-[8rem] font-bold">
            ¶
          </span>

          <p
            className="line-clamp-4 grow font-serif text-justify italic opacity-90"
            style={{ lineHeight: LINE_HEIGHT, hyphens: "auto" }}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
