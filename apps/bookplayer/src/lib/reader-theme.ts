/**
 * The two names the reading theme is stored and expressed under, in one place
 * because three parties must agree on them exactly and none of them can import
 * the others' internals: the pre-hydration script in `routes/__root.tsx`, the
 * CSS in `styles.css`, and `EpubReader`'s `setTheme`.
 *
 * Changing either value means changing `styles.css` in the same commit — the
 * selector there is a string literal the type system cannot check.
 */

/** localStorage key holding `"default" | "light" | "dark"`. Global, not
 *  per-book: a reading preference belongs to the reader, not the book. */
export const READER_THEME_KEY = "bookplayer:reader-theme";

/** Attribute set on <html> before first paint; drives `.reader-surface`. */
export const READER_THEME_ATTR = "data-reader-theme";
