# Align

Sparse VTT–EPUB alignment: high-confidence anchors connecting a Whisper
transcript's word positions and times to EPUB text positions. Two exact passes
(global `k=6` n-grams + LIS, then gap-scoped `k=4`) through one reconciliation
gate; later passes add matches inside residual gaps without touching stronger
anchors. Design:
[`thoughts/design/epoch4-alignment-design.md`](../../thoughts/design/epoch4-alignment-design.md).

## TODO

- Corpus-evidence decisions pending the first full private run: `linear="no"`
  default, coverage baseline, review sample size.

## Operations

```bash
bun run align                      # align every matched book in every root
bun run align -- --list            # discovery only: triplets + exclusions
bun run align -- -r fixtures       # one root (fixtures | private | all)
bun run align -- -s "culture banks"   # filter matches (AND, case-insensitive)
bun run align -- --exclude-nonlinear  # linear="no" comparison baseline
```

Quality gate: root `bun run ci` (from the repo root) — no app-local check
scripts.

Reports land in `reports/` — gitignored, PRIVATE (derived from the private
corpus; see root `docs/PRIVACY.md`), with a nested LOCAL-ONLY git repo for
regression history. An unfiltered all-roots run regenerates the whole tree
(preserving `.git`); filtered runs upsert. Per book:
`reports/<root>/<base>.alignment.json`; per run: `reports/summary.json`.

## Manual anchor review

Each book report carries `reviewSamples` — a deterministic stratified sample
(edge-first, edge-last, interior, anomaly-adjacent) with the narration text, the
book text, and the narration timestamp. Procedure:

1. Read `vttText` vs `epubText`; play the audio at `vttStartSec` when in doubt.
2. An anchor fails only if the narration at that time is NOT the book text at
   that address. Record failures with a reason code:
   - `false-anchor` — texts genuinely differ (algorithm error; blocking)
   - `repeated-phrase` — anchor landed on the wrong occurrence
   - `transcript-error` — Whisper misheard; texts agree with the audio intent
   - `edition-diff` — narration and EPUB are different editions
3. Zero-match spine items and anomalous gaps (in `metrics.warnings` and
   `metrics.anomalies`) get a reason each: front-matter, images, edition gap, or
   algorithm failure.

No `false-anchor` is allowed in the Pass 1 high-confidence tier.

## Setup

`bun install` from the repo root. The private corpus root
(`/Volumes/Space/Reading/audiobooks`) and all parameters live in
[`lib/config.ts`](lib/config.ts); missing roots are skipped with a warning.

## Context

- Inputs: `@prosodio/vtt` transcripts (`data/transcribe/output` or
  `fixtures/transcriptions`) paired to corpus books by basename (reference:
  `scripts/match-vtt.sh`); the EPUB is the m4b's same-basename sibling.
- EPUB text: epub-ts archive + jsdom (always; no LinkeDOM hybrid), spine order,
  `head`/`script`/`style` excluded, block-boundary separators.
- The committed Alice triplet is the public end-to-end fixture — deliberately
  hard: the narration reads the full Gutenberg #11 text, the EPUB is the
  abridged illustrated #19033 retelling.
