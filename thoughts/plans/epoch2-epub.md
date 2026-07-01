# epoch2-epub — EPUB parsing and validation

Goal: port `epub-validate` intact and introduce the smallest justified
production EPUB abstraction.

- [ ] Port `epub-validate` with its validated findings intact; keep
      `ParserOutput` as the parser-parity contract.
- [ ] Introduce the smallest production EPUB abstraction an actual consumer
      justifies — do not turn validation adapter boundaries directly into
      production packages.
- [ ] Keep browser (Playwright) and Storyteller machinery out of production
      dependency graphs.
- [ ] Reports/generated artifacts: default them to volatile `data/<app>/…`
      (gitignored). Artifacts derived from private corpora ARE private (they
      carry filenames/metadata) — a committed `reports/` leaked corpus metadata
      before, so there is no standing committed reports dir. Only deterministic
      public-fixture summaries may be committed, via a deliberate promotion that
      strips identity. Design that promotion here if a real need appears.
- [ ] Use this port to exercise dependency sharing, runtime isolation, and
      dead-dependency checks deliberately.
