# epoch2-epub — EPUB parsing and validation

Status: active

Goal: port `epub-validate` intact, then introduce the smallest justified
production EPUB abstraction.

Method: two-phase behavior-preserving port, same as epoch 1 — see the retained
`epoch1-transcribe.md` (worked exemplar) and `provenance.md`. Anchor = rsync
verbatim, gitignore-gate validation, commit as-is (ci-RED); then normalize
(`@prosodio/*` scope, declared deps, paths). ai-garden is read-only; work on a
new `epoch2` branch.

- [ ] Port `epub-validate` (ai-garden repo root) with its validated findings
      intact (see its FINDINGS doc); keep `ParserOutput` as the parser-parity
      contract. The SPLIT shape is NOT pre-specified — decide it here, from the
      code.
- [ ] Reconcile epub-validate's `docs/` — it is a planning folder (its
      `thoughts/` analogue; `docs/archive/` holds done/historical plans). After
      the anchor, prune the archive + done plans (they don't graduate). One
      keeper: `DESIGN-epub-indexing` is actually a sketch of epoch 4's
      alignment/indexing work — route it to `epoch4-alignment.md`, don't
      discard.
- [ ] Copy `apps/transcribe/lib/config.ts` into the epub app as its own path
      config (a second consumer). This makes the later lift to `packages/config`
      easier and keeps it independent — see BACKLOG `promote-app-config`.
- [ ] Reports: bring epub-validate's `reports/` over as-is but gitignored —
      never committed to this public repo (derived-from-private is private; see
      [PRIVACY.md](../../docs/PRIVACY.md)). Decide keep/how during the port: if
      we want git history to catch report regressions, make `reports/` a NESTED
      LOCAL-ONLY git repo (its own `git init` inside the gitignored folder,
      never pushed) — the same nesting trick prosodio uses inside ai-garden.
- [ ] Normalize the port onto the monorepo contract, in reviewable commits:
  - [ ] Commit mechanical prettier reformatting separately from behavior and
        configuration changes.
  - [ ] Align the package name and script targets with prosodio; every required
        build, typecheck, lint, and test path must be reached coherently by the
        root commands, with no app-local CI escape hatch.
    - [ ] Audit `package.json` targets against the monorepo contract: add
          missing targets, replace incompatible standalone targets, and remove
          extraneous targets only after confirming they have no caller.
  - [ ] Set a provisional root-format boundary for the private `reports/`
        worktree and generated browser `dist/`; Git ignore alone does not keep
        prettier from traversing them.
  - [ ] Before Epoch 2 closes, revalidate that boundary with evidence:
    - [ ] `dist/`: confirm exclusion is the right ownership model for the
          generated browser bundle and document why.
    - [ ] `reports/`: test whether the report writer can emit deterministic,
          Prettier-clean output; then decide whether root format CI should check
          it or the nested private repo should remain fully excluded.
  - [x] Port ai-garden's four public `test-books/` EPUBs into prosodio's
        committed fixtures layout. Merge their download sources into
        `fixtures/manifest.jsonc` and `scripts/fetch-and-check-fixtures.ts`,
        reconciling the existing Alice fixture rather than duplicating it.
  - [x] Replace the temporary ai-garden fixture path in app config/tests with
        the prosodio fixture paths.
  - [ ] Document the ignored, nested LOCAL-ONLY reports repo and its privacy
        boundary. Treat it as an explicit local exception pending the later
        keep/move/drop decision; justify direct replacement of generated files
        so report regeneration preserves `.git`.
  - [ ] Revisit `cleanReportDir` during normalization: keep the smallest clear
        implementation that preserves `.git`, deletes stale generated files, and
        changes no parser/comparison behavior.
  - [ ] Revisit timeout-path test cost: the malformed truncated ZIP currently
        takes about 30 seconds in `BrowserTransport.open` and 10 seconds in
        `openNode`. Preserve explicit timeout coverage while shortening routine
        root CI if the production timeout can be injected or otherwise bounded
        safely in tests.
  - [ ] Triage the inherited `apps/epub-validate/README.md` TODO list item by
        item. Remove work already completed, keep active Epoch 2 obligations in
        this plan, route alignment-dependent work to Epoch 4, and move genuinely
        unscheduled work to `thoughts/BACKLOG.md` in its canonical issue format.
        Update the README only after every old TODO has an explicit disposition.
  - [ ] Remove the nested lockfile, superseded scripts/config, archived plans,
        and dead dependencies only after their replacements are exercised.
  - [ ] Make root `bun run ci` green and prove it covers epub-validate.
- [ ] Introduce the smallest production EPUB abstraction an actual consumer
      justifies — do not turn validation adapter boundaries directly into
      production packages.
- [ ] Keep browser (Playwright) and Storyteller machinery out of production
      dependency graphs.
- [ ] Use this port to exercise dependency sharing, runtime isolation, and
      dead-dependency checks deliberately.

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
