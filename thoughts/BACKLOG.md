# BACKLOG

Unscheduled work. Format: see [docs/WORKFLOW.md](../docs/WORKFLOW.md). Ported
as-is from the consolidation plan's "Issues to address later"; triage pending.

- [ ] align-epub-parser-decisions — evaluate align's two EPUB DOM-parser
      compromises (accepted deferred at epoch4 close; see
      `plans/archive/epoch4-alignment.md` §8 Acceptance)
  - why: both change how EVERY book's text is extracted in
    `apps/align/lib/epub-extract.ts`; both were expedient, neither reviewed
    against the corpus, and they may interact.
  - compromise 1 — jsdom forced, always, in-process: bypasses the
    LinkeDOM-first + jsdom-fallback hybrid proven over 756 books in
    `apps/epub-validate/src/epubts-node.ts`; no subprocess hang guard. Relates
    to `epubts-node-jsdom-always`.
  - compromise 2 — parse content as `application/xhtml+xml` first, fall back to
    `text/html` for non-well-formed docs (commit `27be8e5`). Added to recover
    two Earthsea epubs whose self-closing `<title/>` made the HTML parser
    swallow the whole body (0 tokens). Caused indexing differences for these
    specific books, but not actual alignment coverage:
    - `Ursula K. Le Guin - Earthsea Cycle 01 - A Wizard of Earthsea.alignment.json`
    - `Ursula K. Le Guin - Earthsea Cycle 02 - The Tombs of Atuan.alignment.json`
    - `Ursula K. Le Guin - Earthsea Cycle 03 - The Farthest Shore.alignment.json`
    - `Ursula K. Le Guin - Earthsea Cycle 04 - Tehanu.alignment.json`
    - `Ursula K. Le Guin - Hainish Cycle 08 - The Telling.alignment.json`
  - evaluate: correctness + coverage delta across the full private corpus, hang
    behaviour, and whether epub-validate's proven approach should be reused
    rather than a fresh one. Decide the real policy; current code is a
    placeholder.
  - revisit-when: hardening extraction beyond epoch 4 (before the alignment
    viewer or a trusted production run relies on it).

- [ ] align-cli-rename — rename the `apps/align/` directory to match its
      CLI-only role (npm name is already `@prosodio/align-cli`)
  - why: the engine moved to `packages/align` (`@prosodio/align`; plan
    `thoughts/plans/bookplayer-align.md` D1), so the dir name no longer says
    what the app is. Deferred as debt: a dir rename breaks references in the
    epoch4 design/plan, READMEs, BACKLOG items, and Daniel's validation commands
    — it must ship with a full reference sweep.
  - revisit-when: next time align-cli itself gets real work.

- [ ] align-better-fixture-pair — replace the Alice public fixture and add a
      second quality audiobook<->epub pair (id kept stable; now shared beyond
      align — see references in `plans/archive/epoch4-alignment.md`)
  - why: the committed Alice epub (Gutenberg #19033, illustrated) is an ABRIDGED
    retelling (~13.3k words; no Mock Turtle / Gryphon / Lobster Quadrille) while
    the committed LibriVox narration reads the full text (~27.5k words). 34% VTT
    coverage is "correct" only because half the book is missing — a poor
    reference for a public e2e fixture.
  - now a SHARED concern, not just align's: `apps/bookplayer` is a second
    consumer of the public pair (canonical record + EPUB search acceptance;
    [decision record](plans/archive/bookplayer.md)). Alice is problematic for
    any audiobook<->epub matching; we want >=2 faithful, good-quality public
    pairs, not one abridged one.
  - open puzzle: LibriVox v8 cites Gutenberg #11; real #11 is full (~26.5k
    words, has the Mock Turtle). Daniel swapped in #11 and reportedly got the
    SAME ~34%/70%, which should be impossible for a full-text epub (expect ~90%
    like the 34 real books). Diagnose: did the swap take effect, or did that #11
    file under-extract (~13k tokens would explain 70% epub coverage)? Capture
    the exact #11 epub used + its extracted token count.
  - find faithful narration<->edition pairs for a trustworthy baseline; unblocks
    `bookplayer-public-acceptance`.

- [ ] align-precision-at-scale — scalable Pass 1 precision evaluation
  - why: manual `reviewSamples` review does not scale — 36 books is already too
    many, the corpus is ~700, and a false anchor would only surface through real
    listening. Eyeballing is not an acceptance strategy at this size.
  - direction: an automated/statistical precision signal instead of manual read
    — diagonal-consistency of accepted spans, local time-monotonicity outliers,
    WPM/word-ratio anomaly clustering, cross-edition agreement — flagging
    suspect anchors for targeted review rather than reading all.
  - revisit-when: epoch4 acceptance needs a precision claim over the corpus.

- [ ] align-soft-basename-match — case-insensitive / soft VTT<->epub pairing
  - why: several private books miss only on epub filename CASE (e.g. "Kafka On
    The Shore.m4b" vs "Kafka on the Shore.epub"); discovery honestly reports
    them `no-epub` rather than guessing.
  - constraint: corpus DIRECTORIES cannot be renamed (audiobookshelf keeps
    production history keyed on them). `.epub` (and possibly `.m4b`) CAN be
    renamed but must be tested carefully against audiobookshelf first.
  - two options to weigh: (a) normalize on-disk `.epub` names to match the m4b;
    (b) add a case-insensitive basename fallback in
    `apps/align/lib/discovery.ts` (exact-first, then case-insensitive, still
    refusing on ambiguity).
  - revisit-when: recovering the missed books matters for the eval.

- [ ] epub-calibre-pollution-audit — detect and decide on Calibre-polluted EPUBs
      across the corpora
  - why: Calibre's viewer silently adds `META-INF/calibre_bookmarks.txt` when it
    opens a book, changing the epub's whole-file sha256 without touching book
    content. It already caused a fixture provenance break (Alice epub, restored
    2026-07-03).
  - detector: `scripts/find-calibre-bookmarks.sh` (read-only; iterates both
    corpora roots, lists flagged epubs with mtime). Scan 2026-07-03: 141/591
    flagged under the audiobooks root, 167/711 under the Dropbox Ebook root.
  - impact: book content is intact (additive META-INF entry); the break is on
    whole-file sha256 provenance/dedup, NOT epub-validate spine hashes or
    alignment text extraction (META-INF is not a spine content document).
  - decide: (a) strip the entry — note re-zipping yields a NEW sha256, it does
    not restore the original unless a known-good source exists; (b) prevent
    recurrence (Calibre viewer setting / open books read-only); (c) whether to
    gate the manifest/fixture check on this in CI.
  - revisit-when: cleaning the corpus or hardening fixture provenance.

- [ ] epoch3-audiobook-validation — assess and port the useful parts of
      `nx-audiobook` (audiobook collection validation)
  - state: was `plans/epoch3-audiobook-validation.md` (Status: planned, never
    started); returned to the backlog at epoch4 close since epoch 3 was not a
    dependency. Plan deleted; the backlog keeps the record.
  - assess and port the useful `nx-audiobook/apps/validate`, `validators`, and
    required file-walking.
  - re-evaluate the generic `Validation` abstraction against real
    EPUB-validation needs; do not unify models just because both say
    "validation".
  - exclude the old viewer/conversion surface unless a fresh requirement
    justifies it.

- [ ] promote-app-config — promote transcribe's `lib/config.ts` to a shared
      `packages/config`
  - state: deferred out of epoch1-transcribe; epub-validate's `src/config.ts`
    (epoch 2), align's `lib/config.ts` (epoch 4), and now
    `apps/bookplayer/src/lib/config.ts` all mirror the pattern — four consumers,
    the trigger condition ("a third consumer") is met.
  - today it is single-app path config: a `DATA_DIR`-rooted `data/<app>/…` tree
    plus a REPO_ROOT-anchored `fixturesDir`. Promote to `packages/config` with
    `DATA_DIR` / `CORPORA_DIR` env overrides.
  - fold in the loose per-app values at the same time: epub-validate's
    open-timeout defaults / concurrency limits, and bookplayer's
    `BOOKPLAYER_ROOT` root-selection + `AUDIOBOOKS_ROOT`/`VTT_DIR` overrides
    (provisional names; [decision record](plans/archive/bookplayer.md)).
  - revisit-when: the CORPORA_DIR override becomes real, or the fourth consumer
    tips the maintenance cost.

- [ ] epub-text-extraction-gate — add text-content extraction (Gate 10B) to
      epub-validate
  - state: deferred — raw spine bytes already agree across all parsers
  - revisit-when: downstream (alignment, epoch 4) needs extracted text.

- [ ] epub-toc-href-validation — validate TOC -> content through the parser
  - resolve nav hrefs against manifest/spine; would settle the TOC href-baseline
    ambiguity flagged in the FINDINGS doc.

- [ ] storyteller-package-doc-failures — investigate Storyteller "could not read
      the package document" failures (17 books)
  - not EPUB 2; both epub.ts paths open them. Was 18; the repaired _Circe_ now
    opens.

- [ ] epubts-node-jsdom-always — consider forcing jsdom always
  - jsdom opens every book LinkeDOM hangs on (9-book fallback today); dropping
    the LinkeDOM-first hybrid simplifies epubts-node at some speed cost.

- [ ] epub-report-html — static self-contained HTML report
  - replace the file-tree markdown report output with a single HTML view.

- [ ] agents-md-convention — are AGENTS.md/CLAUDE.md required and respected, and
      which wins?
  - state: provisional
  - which wins when AGENTS.md, CLAUDE.md, and `.cursor/rules` coexist? Current
    seed is a minimal placeholder.
  - reconcile against existing examples (`bun-one/CLAUDE.md`, the experiments'
    CLAUDE/AGENTS files, bun init's generated CLAUDE.md + `.cursor` rule).
  - revisit-when: after a few epochs actually exercise an agent here.

- [ ] mdx-linting — formatting/linting for `.mdx` when frameworks land
  - state: open, defer
  - prettier has an mdx parser, but `lint:md` glob `**/*.md` won't match `.mdx`
    and markdownlint doesn't lint mdx.
  - decide then: format mdx with prettier? add an `[mdx]` block to
    `.vscode/settings.json`? extend/separate the lint glob? structural linter?
  - revisit-when: the first `.mdx` file (Astro/TanStack).

- [ ] catalog-workflow-doc — document the `workspaces.catalogs` workflow
  - state: todo at docs time
  - `catalogs.runtime` seeded empty; add an entry only when a dep is shared by
    2+ packages — pin one version, consumers reference `catalog:runtime`.
    Demand-driven, not speculative.
  - multiple named catalogs expected (bun-one runs `runtime` (zod, valibot) and
    `testing` (@testing-library/react)); add `testing` when test deps arrive.
  - write up in `docs/DEPENDENCY.md`; ref shape in
    `bun-one/docs/WORKSPACE-BUN.md`.

- [ ] sanity-reconcilers — desired -> actual convergence validators
  - state: principle; post-seed; pairs with the `@bun-one/quality` direction
  - k8s-style: state DESIRED generally, compute ACTUAL from the source of truth,
    report/converge the diff. Mechanism is open (jq, bun script, CUE — not the
    point); the loop is. Enforces invariants the type system/formatters can't.
  - naming: `sanity:<thing>` (e.g. `sanity:editor`, `sanity:catalog`), umbrella
    `sanity` runs all, gateable in `ci`. Placeholder `sanity` script exists now.
  - known instances (extensible):
    - editor settings: desired = settings we care about (formatter routing,
      format-on-save, rulers…); actual = layered `.vscode`/user JSON. PROVEN
      kernel: `jsonc-parser` via bun -> jq. Demonstrated on Cursor.
    - package.json invariants: catalog hoisting (dep in 2+ packages MUST be a
      `catalog:` entry), allowed fields, version-pin policy, script presence.

- [ ] document-prosewrap — document line length + proseWrap choices
  - state: todo at docs time (in `docs/FORMATTING.md`/`docs/MARKDOWN.md`)
  - decided: `proseWrap: always` (deviation from `preserve`; price is reflow
    churn) and width = prettier default 80 (dropped the 100 override).
  - package.json can't carry comments (strict JSON) so rationale lives in docs.
  - revisit-when: 80 proves cramped for tables/code-in-prose.

- [ ] dependency-update-doc — document the update workflow
  - state: todo
  - `outdated` only reports (`bun outdated -r`). bun 1.3.14: `bun update` =
    within-range; `--latest` = bump past ranges, all, non-interactive;
    `bun update -i -r` = native interactive recursive picker (flags work though
    absent from --help). Beats `npm-check-updates -i`.
  - implemented as `outdated:fix` (`bun update -i -r`).
  - CAVEAT: verify it handles `catalog:` references; catalog bumps may need
    separate handling.
  - revisit-when: the first dependency goes stale.

- [ ] dotfile-ownership — who owns generated dotfile decisions?
  - state: open
  - bun init (and later tool inits) generate dotfiles whose embedded decisions
    (tsconfig strictness, ignore globs, version floors) nobody explicitly chose.
    "Generated" is not "decided".
  - candidate direction: a central config-owning package (cf.
    `bun-one/plans/BUN_ONE_QUALITY.md`, the `@bun-one/quality` idea).
  - revisit-when: dotfile sprawl across packages becomes painful.

- [x] prettier-tables-vs-deno — validate prettier md tables vs deno fmt
  - state: validated 2026-06-28 (doc-write folded into document-prosewrap)
  - a ragged GFM table through prettier came out byte-identical to deno's
    aligned output; Daniel confirmed format-on-save aligns in Antigravity.
    prettier-only is safe for tables.
  - spot-check on first real occurrence: alignment markers (`:---:`), very-wide
    tables, CJK width.

- [x] bookplayer — build the Prosodio Bookplayer app
  - why: reader-first audiobook player over the canonical library (m4b + cover;
    epub/vtt capabilities), consolidating the ai-garden experiments
  - plan: [plans/archive/bookplayer.md](plans/archive/bookplayer.md) (design +
    decision record + acceptance evidence); app at `apps/bookplayer`
  - done 2026-07-04 on branch `bookplayer-fable`; private Dizzy regression
    passed (12 results, in-bounds highlight surviving mobile reflow)
  - follow-ups carried forward: `bookplayer-ebook-renderer`,
    `bookplayer-alignment-layout`, `bookplayer-public-acceptance`

- [ ] bookplayer-ebook-renderer — keep the EPUB renderer swappable; evaluate
      alternatives to epub.js later
  - why: epub.js (0.3.x) is old and weakly typed — search/highlight was the
    codex experiment's death, and it logs caught IndexSizeErrors during some
    relocations. Accepted for v1; the whole API surface is isolated in one
    component (`apps/bookplayer/src/components/EpubReader.tsx`) behind a lifted
    controller so a swap does not touch the player.
  - candidates to weigh: readium-js / `@readium`, foliate-js, a custom paginator
    over the already-extracted spine text (align's `epub-extract.ts`). Trade
    rendering fidelity vs. control over search/highlight/CFI.
  - revisit-when: search/highlight reliability or reader theming becomes a real
    limitation. See [plan](plans/archive/bookplayer.md) §EPUB reader.

- [x] bookplayer-alignment-layout — revisit the player component structure to
      surface alignment data
  - done 2026-07-05 on branch `bookplayer-align`: AlignmentViewer panel
    (word-level match runs + residual-gap markers), 50/50 split with toggle,
    show-in-book EPUB positioning, and playback-synced three-view follow mode.
    Engine extracted to `packages/align` (`@prosodio/align`); design + decision
    record: [plan](plans/bookplayer-align.md).
  - v1 limitation carried forward: reader follow is driven by the
    AlignmentViewer's active cue, so it only operates while the alignment panel
    is open (open by default). Decouple if a "follow with panel closed" flow is
    wanted.

- [ ] bookplayer-public-acceptance — commit a public-fixture browser acceptance
      for the search -> navigate -> highlight flow
  - why: the strong regression (home search `Use Of Weapons` -> EPUB search
    `Dizzy` -> click result -> visible in-bounds highlight surviving mobile
    reflow) is PRIVATE-corpus only — it lives in the archived plan's Phase 8
    log + gitignored `data/bookplayer/evidence/`, so it is not repeatable in CI
    or on a fresh checkout. Want a committed, public equivalent
    (`Rabbit`-on-Alice already returns results and highlights; verified manually
    in Phase 5 but not captured as a test).
  - decide the harness: MCP/in-app browser per the seed (NO local Playwright in
    bookplayer), or a headless alternative — and whether it gates CI or is a
    documented manual acceptance.
  - partly blocked by `align-better-fixture-pair` for a trustworthy pair, but
    the Alice search path works today. See [plan](plans/archive/bookplayer.md)
    §Final acceptance checklist.
