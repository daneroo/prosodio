/**
 * Strict Pass 1 normalization (design: NFKC, lowercase, [^\p{L}\p{N}]+ as
 * boundaries) producing the tokens AND the normalized-to-raw offset map in one
 * pass, so normalization can never drift from addressing.
 *
 * The walk consumes one "unit" at a time — a base code point plus any
 * following combining marks — and normalizes each unit independently. That
 * keeps raw offsets exact at unit granularity, including combining-sequence
 * composition (e + U+0301 -> é). Punctuation, apostrophes, and hyphens are
 * boundaries; digits are preserved. Alternative apostrophe/hyphen/diacritic/
 * spoken-number rules belong to named later passes, not this policy.
 */

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const COMBINING_MARK = /\p{M}/u;

export interface Token {
  /** Normalized token text — what matching operates on. */
  norm: string;
  /** Raw source slice, for diagnostics. */
  raw: string;
  /** Half-open range in the normalized text stream. */
  start: number;
  end: number;
  /** Half-open range in the raw source string. */
  rawStart: number;
  rawEnd: number;
}

export interface NormalizedText {
  /** Canonical normalized stream: tokens joined by single spaces. */
  text: string;
  tokens: Token[];
}

export function normalizeText(raw: string): NormalizedText {
  const tokens: Token[] = [];
  let norm = "";
  let rawStart = -1;
  let rawEnd = -1;

  const closeToken = () => {
    if (norm.length === 0) return;
    const start = tokens.length === 0 ? 0 : tokens[tokens.length - 1]!.end + 1;
    tokens.push({
      norm,
      raw: raw.slice(rawStart, rawEnd),
      start,
      end: start + norm.length,
      rawStart,
      rawEnd,
    });
    norm = "";
    rawStart = -1;
  };

  let i = 0;
  while (i < raw.length) {
    // One unit: a base code point plus its combining marks.
    const unitStart = i;
    i += codePointLength(raw, i);
    while (i < raw.length && COMBINING_MARK.test(raw[i]!)) {
      i += codePointLength(raw, i);
    }
    const normalizedUnit = raw
      .slice(unitStart, i)
      .normalize("NFKC")
      .toLowerCase();

    for (const char of normalizedUnit) {
      if (LETTER_OR_NUMBER.test(char)) {
        if (norm.length === 0) rawStart = unitStart;
        norm += char;
        rawEnd = i;
      } else {
        closeToken();
      }
    }
  }
  closeToken();

  return { text: tokens.map((t) => t.norm).join(" "), tokens };
}

function codePointLength(s: string, index: number): number {
  const code = s.codePointAt(index)!;
  return code > 0xffff ? 2 : 1;
}
