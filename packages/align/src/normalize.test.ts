import { describe, expect, test } from "bun:test";
import { normalizeText } from "./normalize.ts";

const norms = (raw: string) => normalizeText(raw).tokens.map((t) => t.norm);

describe("strict Pass 1 normalization", () => {
  test("lowercases and treats punctuation as boundaries", () => {
    expect(norms('"And what is the use of a book?" thought Alice')).toEqual([
      "and",
      "what",
      "is",
      "the",
      "use",
      "of",
      "a",
      "book",
      "thought",
      "alice",
    ]);
  });

  test("apostrophes split (strict policy, not a coverage claim)", () => {
    expect(norms("don't — Alice's")).toEqual(["don", "t", "alice", "s"]);
    // Curly apostrophe behaves the same as ASCII.
    expect(norms("don’t")).toEqual(["don", "t"]);
  });

  test("hyphens split", () => {
    expect(norms("well-known waistcoat-pocket")).toEqual([
      "well",
      "known",
      "waistcoat",
      "pocket",
    ]);
  });

  test("Unicode letters and diacritics are retained (not ASCII \\W)", () => {
    expect(norms("café naïve Öl")).toEqual(["café", "naïve", "öl"]);
    // Combining sequence composes to the same token as precomposed.
    expect(norms("café")).toEqual(["café"]);
  });

  test("digits are preserved", () => {
    expect(norms("Chapter 12, page 30")).toEqual([
      "chapter",
      "12",
      "page",
      "30",
    ]);
    // NFKC expands ½ to 1⁄2 with no boundary before it, so 3½ -> "31", "2" —
    // identical to the design's whole-string reference normalizer.
    expect(norms("3½")).toEqual(["31", "2"]);
  });

  test("NFKC folds compatibility forms", () => {
    expect(norms("ﬁnd ｆｕｌｌｗｉｄｔｈ")).toEqual(["find", "fullwidth"]);
  });

  test("empty and boundary-only input produce no tokens", () => {
    expect(normalizeText("").tokens).toEqual([]);
    expect(normalizeText(" …—! ").tokens).toEqual([]);
    expect(normalizeText(" …—! ").text).toBe("");
  });
});

test("one-pass output equals the design's whole-string reference pipeline", () => {
  const samples = [
    '"And what is the use of a book?" thought Alice.',
    "don’t — Alice's well-known waistcoat-pocket",
    "café naïve Öl café ﬁnd ｆｕｌｌｗｉｄｔｈ",
    "Chapter 12, page 3½ … done!",
    " …—! ",
  ];
  for (const raw of samples) {
    const reference = raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    expect(normalizeText(raw).text).toBe(reference);
  }
});

describe("offset map", () => {
  test("normalized offsets address the canonical space-joined stream", () => {
    const { text, tokens } = normalizeText("Down the Rabbit-Hole");
    expect(text).toBe("down the rabbit hole");
    for (const token of tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.norm);
    }
  });

  test("raw ranges point back into the original string", () => {
    const raw = '"Oh dear! Oh dear!"';
    const { tokens } = normalizeText(raw);
    expect(tokens.map((t) => raw.slice(t.rawStart, t.rawEnd))).toEqual([
      "Oh",
      "dear",
      "Oh",
      "dear",
    ]);
  });

  test("raw ranges survive length-changing normalization", () => {
    const raw = "the ﬁne café 12";
    const { tokens } = normalizeText(raw);
    expect(tokens.map((t) => t.norm)).toEqual(["the", "fine", "café", "12"]);
    expect(tokens.map((t) => raw.slice(t.rawStart, t.rawEnd))).toEqual([
      "the",
      "ﬁne",
      "café",
      "12",
    ]);
  });
});
