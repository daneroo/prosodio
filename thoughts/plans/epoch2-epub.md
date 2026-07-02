# epoch2-epub — EPUB parsing and validation

Status: active

Goal: port `epub-validate` intact, then introduce the smallest justified
production EPUB abstraction.

Method: two-phase behavior-preserving port (exemplar: `epoch1-transcribe.md` +
`provenance.md`). ai-garden read-only; branch `epoch2`; full `bun run ci` at
every commit.

## Done (trace; detail in Progress log + provenance.md)

- [x] Phase-A anchor (`02b4fe7`): verbatim rsync, blob OIDs 49/49, zero
      reports/node_modules committed.
- [x] Reports: gitignored + NESTED LOCAL-ONLY git repo for private regression
      history (`f729016`); report swap preserves `.git`. Baselines committed
      there (ai-garden + prosodio reproduction).
- [x] Private-corpus equivalence (Daniel): 1,304 occurrences / 756 distinct
      books, full structural agreement; diffs attributed to corpus drift (Circe,
      Roger Ackroyd), not the port.
- [x] Generated-output boundary (`9011dfe`): prettier excludes `dist/` +
      `reports/`.
- [x] Normalize + root CI green (`c4615ff`): prettier pass, `docs/archive/`
      pruned (per plan), eslint findings fixed; 216 tests pass.
- [x] Public EPUB corpus migrated into `fixtures/epub/` (`219f989`, `65d0f54`):
      manifest provenance URLs + strict hashes; Gutenberg endpoints are MUTABLE
      (committed bytes are the source of truth); no path reaches into ai-garden.
      Daniel corpus-validated (only Alice's content key changed, intentionally).
- [x] `DESIGN-epub-indexing.md` retained at `apps/epub-validate/docs/`;
      `epoch4-alignment.md` references it (epoch-4 input).

## Remaining

- [ ] Config: align `src/config.ts` to the transcribe pattern (single `config`
      object, REPO_ROOT anchor) as the second consumer for the future
      `packages/config` lift (BACKLOG `promote-app-config`). Corpus roots stay.
- [ ] Package contract: rename to `@prosodio/epub-validate`; drop app-local
      `ci`/`typecheck` escape hatches (root `ci` covers them); remove nested
      `bun.lock` + `knip.json` (no callers).
- [ ] Timeout test cost: node timeout is env-injectable
      (`NODE_OPEN_TIMEOUT_MS`); add the browser equivalent and inject short
      timeouts in tests — preserve explicit timeout coverage, cut the ~40s of CI
      waits.
- [ ] `cleanReportDir`: confirm smallest clear implementation that preserves
      `.git` (review, likely no change).
- [ ] Boundary close-out: document `dist/` exclusion rationale (generated
      bundle) and keep `reports/` fully excluded (deterministic prettier-clean
      reports not worth it); document the nested LOCAL-ONLY reports repo durably
      in `docs/PRIVACY.md` + a `.gitignore` comment.
- [ ] README: triage the inherited TODO list item by item (drop done / keep
      epoch-2 / route epoch-4 / BACKLOG); update Operations (no app-local ci).
- [ ] Production EPUB abstraction: DECISION — defer to epoch 4 (just-in-time; no
      consumer exists yet). Playwright/Storyteller isolation is thereby
      satisfied: they stay app-internal; no production package exists.
- [ ] Final: root `bun run ci` green; Daniel runs full private-corpus
      `bun run validate` and accepts the epoch.

## Progress log

Append-only; newest at the bottom. Each entry: date, step, command/commit.

- 2026-07-01 — Phase-A anchor. Daniel rsynced `ai-garden/epub-validate/` to
  `apps/epub-validate/`; prosodio `02b4fe7` committed the source as-ported
  (ci-RED by construction, CI deliberately skipped). Gate: 49 staged source
  files, blob OIDs 49/49 identical to ai-garden `7600ed8`; zero reports and zero
  `node_modules` committed.
- 2026-07-01 — Minimal surgery to reproduce the private reports before native
  normalization: `zod` -> `catalog:runtime`, root `bun install` updated the root
  lock, and `reports/` became an explicitly ignored, nested LOCAL-ONLY Git repo.
  The imported atomic report swap renamed and deleted the entire old `reports/`,
  including its `.git`; changed only the report replacement mechanics to
  validate/sanitize in memory, delete every report entry except `.git`, then
  write directly. The temporary `test` root points back to ai-garden's fixtures;
  fixture migration comes later.
- 2026-07-01 — Full private-corpus regression run exposed corpus drift rather
  than a port regression: the Space copy of _Circe_ and the sole _Murder of
  Roger Ackroyd_ had changed bytes, while the Dropbox copy of _Circe_ was still
  old. The split Circe hashes temporarily changed 1,304 occurrences from 756 to
  757 distinct books (deduped 548 -> 547). Daniel synchronized the fixed Space
  Circe to Dropbox and reran `bun run validate` (5m05.870s): 1,304 occurrences /
  756 distinct; epubts-node and browser opened all 756 with full structural
  agreement. Storyteller improved from 213 opened / 18 failed to 214 / 17
  because fixed Circe now opens. Remaining report diffs are attributable to the
  repaired Circe and Roger Ackroyd content hashes; the nested reports repo holds
  the private comparison evidence.
- 2026-07-01 — Established the provisional generated-output boundary in
  `9011dfe`: root Prettier excludes the built browser `dist/` and the ignored,
  private nested `reports/` worktree; the app ignore file now documents those
  two outputs and no longer names the retired `.reports-next/` and
  `.reports-previous/` swap directories. Both exclusions remain explicit
  pre-close review items.
- 2026-07-02 — Normalized the anchored port and restored green root CI in
  `c4615ff`. Reformatted the source, tests, parser-output fixtures, README, and
  retained findings/design docs; removed `CLAUDE-review.md` and completed or
  historical `docs/archive/` planning material; and fixed the two
  `no-useless-assignment` findings in the parser worker wrappers. The test-book
  path remains a documented temporary pointer into ai-garden and must move to
  prosodio `fixtures/epub/`. Root `bun run ci` passed with 216 tests passing and
  zero failures. Follow-ups record the package-script audit and the 30-second
  browser / 10-second node timeout-test cost.
- 2026-07-02 — Migrated the public EPUB corpus fully inside prosodio.
  Gutenberg's generated EPUB endpoints proved mutable: current rsync-mirror
  artifacts had different hashes from the ai-garden copies. Manifest URLs
  uniformly record provenance; only the large gitignored M4B sets
  `fetchIfMissing`, and hashes remain strict for every entry. Kept one Alice
  EPUB: the illustrated Gordon Robinson Gutenberg #19033 edition now replaces
  #11 beside the audiobook and participates in epub-validate's recursive
  public-fixture corpus. The other three current Gutenberg fixtures live under
  `fixtures/epub/` with stable ID-bearing names. App runtime and all tests now
  obtain public and crafted fixture roots from `src/config.ts`; no path reaches
  into ai-garden. Fixture reconciliation passed, as did ESLint, TypeScript, and
  10 focused parser/schema fixture tests.
- 2026-07-02 — Corrected the fixture migration before continuing: restored the
  exact ai-garden filenames and bytes for Flatland, Aristotle, and Dickens, and
  retained the original Alice filename while intentionally updating only its
  #19033 bytes/hash to `fe83b1b3…`. The `test` root is `fixtures/epub/`.
  Daniel's full private-corpus validation confirmed that only Alice's
  content-addressed report key changed; the local-only reports repository
  records that baseline.
- 2026-07-02 — Claude takes over from Codex. Plan reorganized: completed work
  compressed into a Done trace (commits preserved), remaining work flattened
  into one list. Decisions folded in: production abstraction DEFERRED to epoch 4
  (no consumer yet); `reports/` stays fully prettier-excluded.
