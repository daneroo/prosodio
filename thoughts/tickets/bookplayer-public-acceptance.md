# bookplayer-public-acceptance — committed public browser acceptance

why: the strong regression (home search `Use Of Weapons` -> EPUB search `Dizzy`
-> click result -> visible in-bounds highlight surviving mobile reflow) is
PRIVATE-corpus only — it lives in the archived plan's Phase 8 log + gitignored
`data/bookplayer/evidence/`, so it is not repeatable in CI or on a fresh
checkout.

- want: a committed, public equivalent for search -> navigate -> highlight
  (`Rabbit`-on-Alice already returns results and highlights; verified manually,
  never captured as a test).
- decide the harness: MCP/in-app browser per the seed (NO local Playwright in
  bookplayer), or a headless alternative — and whether it gates CI or is a
  documented manual acceptance.
- partly blocked by `align-better-fixture-pair` for a trustworthy pair, but the
  Alice search path works today.

See [plans/archive/bookplayer.md](../plans/archive/bookplayer.md) §Final
acceptance checklist.
