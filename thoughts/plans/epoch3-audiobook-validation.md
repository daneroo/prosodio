# epoch3-audiobook-validation — Audiobook collection validation

Status: planned

Goal: assess and port the useful parts of `nx-audiobook`.

- [ ] Assess and port the useful `nx-audiobook/apps/validate`, `validators`, and
      required file-walking.
- [ ] Re-evaluate the generic `Validation` abstraction against real
      EPUB-validation needs; do not unify models just because both say
      "validation".
- [ ] Exclude the old viewer/conversion surface unless a fresh requirement
      justifies it.
