# align-precision-at-scale — scalable Pass 1 precision evaluation

why: manual `reviewSamples` review does not scale — 36 books was already too
many, the corpus is ~700, and a false anchor would only surface through real
listening. Eyeballing is not an acceptance strategy at this size.

- direction: an automated/statistical precision signal instead of manual read —
  diagonal-consistency of accepted spans, local time-monotonicity outliers,
  WPM/word-ratio anomaly clustering, cross-edition agreement — flagging suspect
  anchors for targeted review rather than reading all.
- natural home in the `matching-quality-design` workstream: precision metrics
  belong in the same persisted-report loop (CLI computes -> report persists ->
  lab views render) as the coverage metrics.

revisit-when: an acceptance claim over the corpus needs precision, not just
coverage.
