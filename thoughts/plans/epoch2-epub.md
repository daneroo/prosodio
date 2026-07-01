# epoch2-epub — EPUB parsing and validation

Status: planned

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
- [ ] Copy `apps/transcribe/lib/config.ts` into the epub app as its own path
      config (a second consumer). This makes the later lift to `packages/config`
      easier and keeps it independent — see BACKLOG `promote-app-config`.
- [ ] Reports: bring epub-validate's `reports/` over as-is but gitignored —
      never committed to this public repo (derived-from-private is private; see
      [PRIVACY.md](../../docs/PRIVACY.md)). Decide keep/how during the port: if
      we want git history to catch report regressions, make `reports/` a NESTED
      LOCAL-ONLY git repo (its own `git init` inside the gitignored folder,
      never pushed) — the same nesting trick prosodio uses inside ai-garden.
- [ ] Introduce the smallest production EPUB abstraction an actual consumer
      justifies — do not turn validation adapter boundaries directly into
      production packages.
- [ ] Keep browser (Playwright) and Storyteller machinery out of production
      dependency graphs.
- [ ] Use this port to exercise dependency sharing, runtime isolation, and
      dead-dependency checks deliberately.
