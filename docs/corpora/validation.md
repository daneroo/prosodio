# Corpus validation

Pass / fail + warnings over the corpora, from one core, run two ways: the visual
web app (Corpora tab) and a standalone CLI. **Validation only** — it reports on
corpora, it does not enrich, convert, or repair them. A corpus passes when it
has zero failures; warnings flag concerns without failing it.

## Introduction — where the corpora come from

The listening library runs on **audiobookshelf, in production daily**, deployed
from the `~/Code/iMetrical/nx-audiobook` repo (pnpm/nx monorepo; audiobookshelf
lives under `infra/`, alongside a Plex audiobook agent). That repo also owns the
**preparation pipeline**: new books land in a staging area, a local
audiobookshelf instance makes them conformant (conversion to m4b, tag curation),
and validated books sync onward to production and its mirrors.

Validation there is two-layered today:

- `just checkfiles` — filesystem hygiene (`.DS_Store`, perms 644/755, macOS
  xattrs) over staging, production, and the local instance's library.
- `apps/validate` — a TypeScript app: directory classification, modification
  times, metadata via ffprobe / music-metadata.

That validator is the ancestor of this effort. Prosodio brings the **visual**
surface (the Corpora tab shows problems at a glance) but its scan/probe logic is
braided into the web app — not callable from a script, not pointable at another
corpus root. This doc defines the consolidation: one validation core, grown
here, that eventually replaces `nx-audiobook`'s validator. The preparation
pipeline itself stays in `nx-audiobook` for now.

## The three corpora

- **fixtures** — public, committed (`fixtures/`).
- **private** — the curated production library (via config).
- **staging** — the audiobookshelf prep area managed by `nx-audiobook`;
  validated read-only, in place.

## Scope

**In:** pass/fail checks with warnings, over any of the three corpora. **Out:**
metadata enrichment (series/narrator/…), the preparation pipeline (conversion,
audiobookshelf conformance), bookId changes, and any cleanup off the validation
path.

## Shape

One pointable core (a package; server-side — it needs `fs` + `ffprobe`) takes a
corpus root and emits findings. Two thin skins consume it: the CLI and the web
server. The browser only ever receives serialized findings — it never runs
validation. This is the seam that un-braids validation from the web app.

## Milestones

1. **Bootstrap** — the CLI exists and validates a corpus root, emitting
   findings. _(not started)_
2. **nx-audiobook parity** — the `checkfiles` + `apps/validate` rules ported and
   tightened: perms 644/755, `.DS_Store`, macOS xattr cleanup, mtime sanity,
   naming conventions, metadata presence. Parity means `nx-audiobook`'s
   validator can retire. _(not started)_
3. **vtt / alignment** — validation extends to VTT and alignment artifacts.
   _(not started)_

## Where it grows

Beyond parity: richer epub/vtt/alignment checks and cross-corpus comparison.
Every rule is a finding on the same channel the Corpora tab already renders.
Backlog items that hang off this doc: `merge-nx-audiobook-validation` (milestone
2), `epub-calibre-pollution-audit`, `align-soft-basename-match`,
`corpora-omnibus-mapping`.
