/**
 * L3 locate-coverage sweep (plan thoughts/plans/bookplayer-align-refine-model.md,
 * T4.4; design thoughts/design/bookplayer-align-refine-model.md, "The DOM
 * path"). The empirical answer to "does EVERY matched EPUB token produce a
 * WORKING epubcfi in the real browser through the real epub.js": for each
 * matched token, resolve its DOM path, run the text guard, generate a CFI,
 * and round-trip it (`new EpubCFI(cfi)` -> `toRange` -> text compare) against
 * a section epub.js actually parsed. Section-level parity (L2, checked once
 * per section) is recorded alongside but does not gate the per-token loop —
 * this sweep MEASURES, it does not short-circuit.
 *
 * Dev-only tool (see routes/lab.locate.$bookId.tsx), never run in CI: it
 * needs a browser + a served book. Browser-only module — epubjs is dynamic-
 * imported inside sweepBook, never at module scope (same rule as
 * EpubReader.tsx), so this file stays safe to import from a route module
 * that may also be touched by SSR analysis.
 */
import {
  checkSectionParity,
  diagnoseRangeFromDomPath,
  normalizeText,
  tokenRaw,
} from "@prosodio/align/browser";
import type {
  AlignmentArtifact,
  DomTokenLocator,
  SectionParityResult,
} from "@prosodio/align/browser";
import type { Book, EpubCFI } from "epubjs";

/** The EpubCFI class's constructor shape — `typeof import("epubjs").EpubCFI`
 * as a value type isn't allowed (consistent-type-imports), so this is spelled
 * out from the imported instance type instead. */
interface EpubCFIConstructor {
  new (cfiFrom?: string | Range | Node, base?: string | object): EpubCFI;
}

export interface SweepSectionReport {
  href: string;
  // Derived from the artifact so the union can't drift from the schema.
  parseMode: AlignmentArtifact["epub"]["spines"][number]["parseMode"];
  extensionPredictedMode: "xhtml" | "html" | "unknown";
  parity:
    | SectionParityResult
    | {
        ok: false;
        reason: "section-not-found" | "section-load-failed" | "section-threw";
      };
  tokens: number;
  ok: number;
  /** Capped at 20 — the sweep reports enough to triage, not every failure. */
  failures: Array<{
    epubSeq: number;
    step: "path" | "text" | "cfi" | "roundtrip";
    detail: unknown;
  }>;
}

export interface SweepReport {
  bookId: string;
  totals: { sections: number; tokens: number; ok: number; failed: number };
  sections: SweepSectionReport[];
}

const MAX_FAILURES_PER_SECTION = 20;

/** One matched EPUB token, paired with its source VTT seq (for the text
 * guard's expected text — the inverse of deriveEpubSeq for this one token). */
interface MatchedToken {
  epubSeq: number;
  vttSeq: number;
}

/**
 * Union of `[epubStart, epubEnd)` over every matched span, grouped by the
 * token's spineIndex column. Spans are guaranteed non-overlapping and
 * equal-width by the artifact schema, so each epubSeq is visited once and
 * `vttStart + (epubSeq - epubStart)` is exact (same math as deriveEpubSeq,
 * run in reverse).
 */
function groupMatchedTokensBySpine(
  artifact: AlignmentArtifact,
): Map<number, Array<MatchedToken>> {
  const bySpine = new Map<number, Array<MatchedToken>>();
  const { spineIndex } = artifact.epub.tokens;
  for (const span of artifact.match.spans) {
    for (let epubSeq = span.epubStart; epubSeq < span.epubEnd; epubSeq++) {
      const spine = spineIndex[epubSeq];
      if (spine === undefined) continue; // defensive; schema guarantees range
      const vttSeq = span.vttStart + (epubSeq - span.epubStart);
      let list = bySpine.get(spine);
      if (!list) {
        list = [];
        bySpine.set(spine, list);
      }
      list.push({ epubSeq, vttSeq });
    }
  }
  return bySpine;
}

function extensionPredictedMode(href: string): "xhtml" | "html" | "unknown" {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(href);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "xhtml" || ext === "xht") return "xhtml";
  if (ext === "html" || ext === "htm") return "html";
  return "unknown";
}

// epubjs's Spine type hides its sections; mirrors EpubReader.tsx's
// SpineItemLike (same runtime shape, only the members this sweep needs).
interface SpineItemLike {
  href: string;
  load: (loader: unknown) => Promise<unknown>;
  unload: () => void;
  document?: Document;
  cfiFromRange: (range: Range) => string;
}

function spineItems(book: Book): Array<SpineItemLike> {
  return (book.spine as unknown as { spineItems: Array<SpineItemLike> })
    .spineItems;
}

/** All-failed report for a section that couldn't be loaded at all — every
 * matched token in it counts as failed with step "path", capped like any
 * other failures list. */
function unresolvedSectionReport(
  spine: AlignmentArtifact["epub"]["spines"][number],
  matched: Array<MatchedToken>,
  reason: "section-not-found" | "section-load-failed" | "section-threw",
  detail: unknown,
): SweepSectionReport {
  return {
    href: spine.href,
    parseMode: spine.parseMode,
    extensionPredictedMode: extensionPredictedMode(spine.href),
    parity: { ok: false, reason },
    tokens: matched.length,
    ok: 0,
    failures: matched.slice(0, MAX_FAILURES_PER_SECTION).map((token) => ({
      epubSeq: token.epubSeq,
      step: "path" as const,
      detail,
    })),
  };
}

async function sweepSection(
  book: Book,
  EpubCFICtor: EpubCFIConstructor,
  artifact: AlignmentArtifact,
  spine: AlignmentArtifact["epub"]["spines"][number],
  matched: Array<MatchedToken>,
): Promise<SweepSectionReport> {
  // Extraction hrefs and epub.js spine hrefs can differ by a base dir
  // prefix; match on either suffix (same rule as EpubReader.locate).
  const section = spineItems(book).find(
    (item) => item.href.endsWith(spine.href) || spine.href.endsWith(item.href),
  );
  if (!section) {
    return unresolvedSectionReport(spine, matched, "section-not-found", {
      requestedSpineHref: spine.href,
      spineHrefs: spineItems(book).map((item) => item.href),
    });
  }

  try {
    await section.load(book.load.bind(book));
  } catch (error) {
    return unresolvedSectionReport(spine, matched, "section-load-failed", {
      sectionHref: section.href,
      error,
    });
  }

  try {
    const document = section.document;
    if (!document) {
      return unresolvedSectionReport(spine, matched, "section-load-failed", {
        sectionHref: section.href,
        reason: "section-document-missing",
      });
    }

    const parity = checkSectionParity(
      document,
      spine.segPaths,
      spine.segTextLen,
    );

    const failures: SweepSectionReport["failures"] = [];
    const pushFailure = (
      epubSeq: number,
      step: "path" | "text" | "cfi" | "roundtrip",
      detail: unknown,
    ) => {
      if (failures.length < MAX_FAILURES_PER_SECTION) {
        failures.push({ epubSeq, step, detail });
      }
    };

    let ok = 0;
    const { tokens } = artifact.epub;
    for (const { epubSeq, vttSeq } of matched) {
      const startSeg = tokens.startSeg[epubSeq];
      const startOffset = tokens.startOffset[epubSeq];
      const endSeg = tokens.endSeg[epubSeq];
      const endOffset = tokens.endOffset[epubSeq];
      if (
        startSeg === undefined ||
        startOffset === undefined ||
        endSeg === undefined ||
        endOffset === undefined
      ) {
        // Defensive; the artifact schema already guarantees these columns
        // are populated for every epubSeq in range.
        pushFailure(epubSeq, "path", { reason: "missing-locator-columns" });
        continue;
      }
      const loc: DomTokenLocator = { startSeg, startOffset, endSeg, endOffset };

      const diagnostic = diagnoseRangeFromDomPath(
        document,
        spine.segPaths,
        loc,
      );
      if (!diagnostic.ok) {
        pushFailure(epubSeq, "path", diagnostic.failure);
        continue;
      }
      const { range } = diagnostic;

      const expected = normalizeText(tokenRaw(artifact.vtt, vttSeq)).text;
      const actual = normalizeText(range.toString()).text;
      if (actual !== expected) {
        pushFailure(epubSeq, "text", { expected, actual });
        continue;
      }

      let cfi: string;
      try {
        cfi = section.cfiFromRange(range);
      } catch (error) {
        pushFailure(epubSeq, "cfi", error);
        continue;
      }

      try {
        const cfiObj = new EpubCFICtor(cfi);
        // The .d.ts claims toRange always returns a Range; epub.js's runtime
        // can hand back undefined when it can't find the node — treat both
        // as a roundtrip failure rather than trust the (inaccurate) type.
        const rtRange: Range | null | undefined = cfiObj.toRange(document);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the .d.ts's non-nullable return type is inaccurate; guard the real runtime behavior.
        if (!rtRange) {
          pushFailure(epubSeq, "roundtrip", { reason: "empty-range", cfi });
          continue;
        }
        const rtText = normalizeText(rtRange.toString()).text;
        if (rtText !== actual) {
          pushFailure(epubSeq, "roundtrip", {
            reason: "text-mismatch",
            expected: actual,
            actual: rtText,
            cfi,
          });
          continue;
        }
      } catch (error) {
        pushFailure(epubSeq, "roundtrip", { reason: "threw", error, cfi });
        continue;
      }

      ok++;
    }

    return {
      href: spine.href,
      parseMode: spine.parseMode,
      extensionPredictedMode: extensionPredictedMode(spine.href),
      parity,
      tokens: matched.length,
      ok,
      failures,
    };
  } finally {
    try {
      section.unload();
    } catch {
      /* ignore unload noise */
    }
  }
}

/**
 * Sweep every matched EPUB token in a book: resolve, guard, CFI-generate,
 * and round-trip it against the real epub.js section it belongs to. One
 * section at a time (load -> check -> unload) to keep memory bounded on long
 * books.
 */
export async function sweepBook(
  artifact: AlignmentArtifact,
  epubUrl: string,
  onProgress?: (done: number, total: number, href: string) => void,
): Promise<SweepReport> {
  // epubUrl is always `/api/epub/${bookId}` (see routes/lab.locate.$bookId.tsx)
  // — the bookId is its last path segment.
  const bookId = epubUrl.split("/").filter(Boolean).pop() ?? "";

  const bySpine = groupMatchedTokensBySpine(artifact);
  const spineIndices = [...bySpine.keys()].sort((a, b) => a - b);
  const total = spineIndices.length;

  const { default: ePub, EpubCFI } = await import("epubjs");
  const book = ePub(epubUrl, { openAs: "epub" });
  await book.ready;

  const sections: Array<SweepSectionReport> = [];
  try {
    let done = 0;
    for (const spineIndex of spineIndices) {
      const spine = artifact.epub.spines[spineIndex];
      const matched = bySpine.get(spineIndex);
      if (!spine || !matched) continue; // defensive; schema guarantees range

      let report: SweepSectionReport;
      try {
        report = await sweepSection(book, EpubCFI, artifact, spine, matched);
      } catch (error) {
        // Defense-in-depth: an unexpected throw inside sweepSection (e.g. a
        // degenerate parsed document) must not abort the whole book — record
        // this section as errored and keep sweeping the rest.
        report = unresolvedSectionReport(spine, matched, "section-threw", {
          error: String(error),
        });
      }
      sections.push(report);
      done++;
      onProgress?.(done, total, spine.href);
    }
  } finally {
    try {
      book.destroy();
    } catch {
      /* already torn down */
    }
  }

  const totals = sections.reduce(
    (acc, section) => ({
      sections: acc.sections + 1,
      tokens: acc.tokens + section.tokens,
      ok: acc.ok + section.ok,
      failed: acc.failed + (section.tokens - section.ok),
    }),
    { sections: 0, tokens: 0, ok: 0, failed: 0 },
  );

  return { bookId, totals, sections };
}
