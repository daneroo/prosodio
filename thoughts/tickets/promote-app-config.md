# promote-app-config — shared `packages/config`

why: four apps mirror the same pattern — transcribe's `lib/config.ts`
(original), epub-validate's `src/config.ts`, align's `lib/config.ts`, and
`apps/bookplayer/src/lib/config.ts`. The "third consumer" trigger is met.

- today it is single-app path config: a `DATA_DIR`-rooted `data/<app>/…` tree
  plus a REPO_ROOT-anchored `fixturesDir`. Promote to `packages/config` with
  `DATA_DIR` / `CORPORA_DIR` env overrides.
- fold in the loose per-app values at the same time: epub-validate's
  open-timeout defaults / concurrency limits, and bookplayer's `BOOKPLAYER_ROOT`
  root-selection + `AUDIOBOOKS_ROOT`/`VTT_DIR` overrides (provisional names;
  [decision record](../plans/archive/bookplayer.md)).
- strategic note (2026-07-10): this is the first brick of the data-plane
  extraction — if a second app (workbench-style) ever needs the corpus/cache,
  the path config is what it needs first. Extraction remains demand-driven;
  don't build the rest of the data-plane package speculatively.

revisit-when: scheduled work touches app config, or the CORPORA_DIR override
becomes real.
