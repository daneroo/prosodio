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
- [ ] Move full-corpus reports to the private workflow; keep public
      deterministic fixtures/summaries sufficient to test the tool.
- [ ] Use this port to exercise dependency sharing, runtime isolation, and
      dead-dependency checks deliberately.
