/**
 * L3 locate-coverage sweep (plan thoughts/plans/bookplayer-align-refine-model.md,
 * T4.4; design thoughts/design/bookplayer-align-refine-model.md, "The DOM
 * path"; all-tokens mode added by plan thoughts/plans/lab-routes-refined.md,
 * S5/D5). The empirical answer to "does EVERY EPUB token produce a WORKING
 * epubcfi in the real browser through the real epub.js": for each token,
 * resolve its DOM path, run the text guard, generate a CFI, and round-trip
 * it (`new EpubCFI(cfi)` -> `toRange` -> text compare) against a section
 * epub.js actually parsed. Section-level parity (L2, checked once per
 * section) is recorded alongside but does not gate the per-token loop — this
 * sweep MEASURES, it does not short-circuit.
 *
 * Two sweep sources (`SweepSource`, exported below): "matched" walks only
 * epub tokens paired to a vtt token by `artifact.match.spans` (today's
 * behavior, alignment-dependent); "all" walks every epub token seq 0..N —
 * the artifact's epub.tokens columns already span every token of every
 * spine doc, only a fraction are matched by spans — decoupling the locate
 * check from alignment coverage (D5). Both reuse the one fetched artifact;
 * no new transport. "all" mode's text guard has no independent
 * expected-text source for unmatched tokens (the artifact carries no raw
 * epub text, only DOM-locator columns — see the guard's inline comment in
 * sweepSection) so that one step is a structural no-op there; every other
 * check (path resolution, CFI generation, CFI round-trip) still runs for
 * every token, matched or not.
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

/**
 * "matched" sweeps today's union of span ranges (every epubSeq that has a
 * paired vttSeq — the alignment-dependent view); "all" sweeps every epub
 * token seq 0..N regardless of whether it was ever matched, decoupling
 * locate coverage from alignment coverage (plan thoughts/plans/lab-routes-
 * refined.md, D5). Both reuse the one fetched artifact — the artifact
 * already carries every epub token's DOM locator columns, matched or not.
 */
export type SweepSource = "matched" | "all";

export interface SweepReport {
  bookId: string;
  source: SweepSource;
  totals: { sections: number; tokens: number; ok: number; failed: number };
  sections: SweepSectionReport[];
}

const MAX_FAILURES_PER_SECTION = 20;

/** One EPUB token to sweep, paired with its source VTT seq when one exists
 * (for the text guard's expected text — the inverse of deriveEpubSeq for
 * this one token). `vttSeq` is null for "all"-mode tokens that were never
 * matched to a VTT token — see sweepSection's text-guard branch. */
interface SweepToken {
  epubSeq: number;
  vttSeq: number | null;
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
): Map<number, Array<SweepToken>> {
  const bySpine = new Map<number, Array<SweepToken>>();
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

/**
 * Every epub token seq 0..N-1, grouped by its spineIndex column — "all"
 * mode's token universe. The artifact's epub.tokens columns already span
 * every token of every spine doc (only a fraction are matched by spans; see
 * the plan's D5), so this is a plain grouping pass, no extraction/
 * tokenization of any kind.
 */
function groupAllTokensBySpine(
  artifact: AlignmentArtifact,
): Map<number, Array<SweepToken>> {
  const bySpine = new Map<number, Array<SweepToken>>();
  const { spineIndex } = artifact.epub.tokens;
  for (let epubSeq = 0; epubSeq < spineIndex.length; epubSeq++) {
    const spine = spineIndex[epubSeq];
    if (spine === undefined) continue; // defensive
    let list = bySpine.get(spine);
    if (!list) {
      list = [];
      bySpine.set(spine, list);
    }
    list.push({ epubSeq, vttSeq: null });
  }
  return bySpine;
}

function groupTokensBySpine(
  artifact: AlignmentArtifact,
  source: SweepSource,
): Map<number, Array<SweepToken>> {
  return source === "matched"
    ? groupMatchedTokensBySpine(artifact)
    : groupAllTokensBySpine(artifact);
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
  matched: Array<SweepToken>,
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
  matched: Array<SweepToken>,
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

      const actual = normalizeText(range.toString()).text;
      // The text guard's expected text is the VTT-side ground truth — an
      // independent source that catches DOM/alignment corruption. Unmatched
      // ("all"-mode) tokens have no vttSeq, and the artifact carries no raw
      // text for the epub side to compare against instead (epub.tokens is
      // DOM-locator columns only — see the module doc and the S5 plan note
      // on judgment calls). So for those tokens this step is structurally a
      // no-op: `actual` stands as-is and the loop moves on to CFI generation,
      // which still exercises the real resolve -> generate -> round-trip
      // path for every epub token, matched or not.
      if (vttSeq !== null) {
        const expected = normalizeText(tokenRaw(artifact.vtt, vttSeq)).text;
        if (actual !== expected) {
          pushFailure(epubSeq, "text", { expected, actual });
          continue;
        }
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
 * Sweep EPUB tokens in a book — matched-only or every token, per `source` —
 * resolve, guard, CFI-generate, and round-trip each one against the real
 * epub.js section it belongs to. One section at a time (load -> check ->
 * unload) to keep memory bounded on long books.
 */
export async function sweepBook(
  artifact: AlignmentArtifact,
  epubUrl: string,
  source: SweepSource,
  onProgress?: (done: number, total: number, href: string) => void,
): Promise<SweepReport> {
  // epubUrl is always `/api/epub/${bookId}` (see routes/lab.locate.$bookId.tsx)
  // — the bookId is its last path segment.
  const bookId = epubUrl.split("/").filter(Boolean).pop() ?? "";

  const bySpine = groupTokensBySpine(artifact, source);
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

  return { bookId, source, totals, sections };
}
