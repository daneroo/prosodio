# Corpora metadata

Where a book's title, author, and (later) series come from, and in what order of
trust.

## Truth hierarchy

The curated **m4b ffprobe tags are canonical**. The directory/file basename is
only a fallback for when a tag is absent — and a fallback is a data defect worth
flagging, not the normal path.

| field  | source (canonical)           | fallback       |
| ------ | ---------------------------- | -------------- |
| title  | `title` tag                  | basename parse |
| author | `artist` (or `album_artist`) | basename parse |

Applied in `apps/bookplayer/src/lib/library.ts` enrich: `scan.ts` seeds
provisional basename values, ffprobe tags overwrite them per-field when present.

The private corpus is rigorously tagged: verified 2026-07-19, `title` and
`artist` are present on **952/952** books, so the basename fallback fires on
zero curated books.

## Why not the basename

The original code was basename-first, treating tags as junk. It generalized from
the **fixtures**, which are the worst possible examples:

- `fixtures/audio/jfk.m4b` — every tag null.
- both Alice m4bs — `title` tag is the LibriVox junk
  `AliceWonderland8_librivox`.

Neither is representative of the curated corpus. Note a consequence: because
Alice's junk title tag _is_ present (just semantically garbage), the app now
faithfully displays it — the code cannot know a present tag is nonsense.
Re-tagging the fixtures is tracked under `align-better-fixture-pair`.

## Not yet done

Series (from the `composer`-adjacent `grouping` tag; semicolon-separated, each
`<name> #<position>`, and a book can belong to **multiple** series), narrator
(`composer`), a `metadata-basename-fallback` finding on the Corpora tab when the
fallback fires, and a dedicated extractor module — all tracked as
`metadata-canonical-from-tags` in [BACKLOG](../../thoughts/BACKLOG.md). Series
modelling is deferred to the emerging corpora-validation work, where the
multi-series shape belongs.
