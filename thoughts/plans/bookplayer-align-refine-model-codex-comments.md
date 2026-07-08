# Codex review comments — bookplayer-align-refine-model

Status: review notes only. Do not treat this as an implementation plan. Claude
is already executing the main plan; fold these comments into that work when the
execution point makes sense.

## 1. Public artifact should not expose private filesystem paths

The planned `AlignmentArtifact.source` carries `vttPath`, `epubPath`, `m4bPath`,
and possibly raw provenance into the artifact served at
`/api/alignment/:bookId`.

That is useful for local reports and cache invalidation, but it is not
appropriate for a browser-served asset. Split the data:

- public artifact: `bookId`, `base`, `vttTiming`, and only sanitized provenance
  if needed;
- server/cache sidecar: absolute paths, source mtimes, staleness key;
- report projection: may include paths if reports remain local/private.

This keeps the artifact cacheable/servable without leaking private corpus paths.

## 2. `fetchArtifact` return type contradicts unavailable behavior

The plan currently says
`fetchArtifact(bookId, signal): Promise<AlignmentArtifact>` but also says
`404 → typed unavailable result`.

Pick one contract. Suggested shape:

```ts
type AlignmentLoadResult =
  { status: "ready"; artifact: AlignmentArtifact } | { status: "unavailable" };
```

Unexpected failures can still throw or return an explicit error state, but a
book with no alignment assets should not pretend to return an artifact.

## 3. `deriveEpubSeq` requires equal-width spans; validate that in the artifact

The proposed helper:

```ts
epubStart + (seq - vttStart);
```

is only valid when every accepted span has equal token width:

```ts
vttEnd - vttStart === epubEnd - epubStart;
```

Add artifact schema invariants:

- span ranges are non-empty;
- VTT and EPUB span widths are equal;
- span ranges are in bounds for their token tables;
- spans are sorted and non-overlapping on both axes.

Without this, one malformed span can silently produce wrong EPUB locations.

## 4. Section parity wording is stronger than the implementation sketch

The design says section parity validates segment count plus per-segment text
length. The plan sketch mostly resolves known `segPaths` and compares lengths;
it does not actually count all browser-visible text segments unless it performs
a browser-side visible-text projection.

Choose one:

- implement true segment-count parity by walking/projecting browser text
  segments with equivalent exclusion rules; or
- rename the check to “segment path/length parity” and stop claiming full
  segment count validation.

The second option is probably fine if the per-token text guard remains.

## 5. “v1 and v2 never cohabit” conflicts with the additive rollout

The design says v1 and v2 never cohabit, while the executable plan keeps v1
alive through the additive phases until the client is cut over.

Suggested wording: no long-term compatibility layer, no dual-format cache, and
v1 is deleted before the feature is accepted. That matches the phased execution
without weakening Daniel's “no backward compat” ruling.

## 6. Word-timing derivation should record its assumption

Current behavior treats `wordTimestamps: true` as “cue start is word start.”
That works if word-timestamped VTTs are cue-per-word. If a cue has multiple
normalized tokens, all those tokens get the same start time and zero-width
intervals except the last.

This is existing behavior, not a new v2 regression, but the v2 artifact makes
the policy more central. Add either:

- a validation/warning that word-timestamped VTTs should be cue-per-word; or
- a test documenting multi-token word-timed cues as collapsed timing.
