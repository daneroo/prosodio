# Corpora metadata

Where a book's title, author, series, and narrator come from, and in what order
of trust.

## Truth hierarchy

The curated **m4b ffprobe tags are canonical**. The directory/file basename is
only a fallback for when the title tag is absent — and that fallback is a data
defect, flagged as a `metadata-basename-fallback` finding on the Corpora tab,
not a normal path.

| field    | source (canonical)           | fallback / default |
| -------- | ---------------------------- | ------------------ |
| title    | `title` tag                  | basename parse     |
| author   | `artist` (or `album_artist`) | basename parse     |
| series   | `grouping` tag               | `[]`               |
| narrator | `composer` tag               | `null`             |

One dedicated pure extractor applies this — `packages/corpus/metadata.ts`
(`extractMetadata` + `parseGrouping`, `@prosodio/corpus`) — called from
bookplayer's `library.ts` enrich; nobody else re-interprets tags. A present
title tag gates the whole basename parse: the basename never backfills a null
author. `BookMetadata.source` records which path won
(`"tags" | "basename" | "pending"`).

Prevalence (private corpus, 2026-07-19): `title` and `artist` **952/952** (the
fallback fires on zero curated books), `composer` (narrator) 936/952, `grouping`
(series) 224/952 — 40 of them multi-series.

## The grouping grammar

`grouping` holds semicolon-separated series memberships, each
`<name> #<position>` with the position optional:

- multi-series is real: `Discworld #34; Discworld: Ankh-Morpork City Watch #7` —
  two entries, names may contain `:`.
- positions can be fractional (novellas): `The Witcher Saga #0.5`.
- junk values with no series shape (`Adult`, `Canons`) parse as name-only
  entries — acceptable noise the lab surfaces make visible.
- observed dialect: `The Khaavren Romances Series, Book #1` — the trailing
  `, Book` stays in the parsed name. A tag-hygiene warning candidate for the
  validator (see `validation.md`), not a parser special case.

Unhandled shapes degrade to validator warnings, never blockers
(metadata-canonical-from-tags D8).

## Why not the basename

The original code was basename-first, treating tags as junk. It generalized from
the **fixtures**, which are the worst possible examples:

- `fixtures/audio/jfk.m4b` — every tag null.
- both Alice m4bs — `title` tag is the LibriVox junk
  `AliceWonderland8_librivox`.

Neither is representative of the curated corpus. Note a consequence: because
Alice's junk title tag _is_ present (just semantically garbage), the app now
faithfully displays it — the code cannot know a present tag is nonsense.
Re-tagging the fixtures is tracked under `fixtures-into-shape`.
