# Corpus validation

Pass / fail + warnings over the corpora, from one core, run two ways: the visual
web app (Corpora tab) and a standalone CLI. **Validation only** — it reports on
corpora, it does not enrich, convert, or repair them. A corpus passes when it
has zero failures; warnings flag concerns without failing it.

## Introduction — where the corpora come from

The listening library runs on **audiobookshelf, in production daily**, deployed
from the `~/Code/iMetrical/nx-audiobook` repo (pnpm/nx monorepo; audiobookshelf
lives under `infra/`, alongside a Plex audiobook agent). That repo also owns the
**preparation pipeline**, a three-hop flow validated at every hop (walkthrough:
its `README.md` Dev/Staging Operations):

1. **prep** — new books land in the local audiobookshelf instance
   (`infra/audiobookshelf/data/audiobooks/`), which makes them conformant
   (conversion to m4b, tag curation);
2. **staging** — rsync to `galois:/Volumes/Space/Reading/audiobooks`;
3. **prod + mirrors** — syno pulls from staging, then syncs back to strip
   xattrs; mirrors pull from staging too.

Validation there is two-layered today:

- `just checkfiles` — filesystem hygiene (`.DS_Store`, perms 644/755, macOS
  xattrs — the sync-back dance above is why xattrs are policed) over staging,
  prod-local, and the instance library.
- `apps/validate` — a TypeScript CLI, **already root-pointable**
  (`pnpm run dev -r <root>`): directory classification, mtime checks against a
  hints database, metadata via ffprobe / music-metadata. It also carries
  `--mtime fix`/`write` and conversion modes — those are repair, excluded from
  parity (see Scope for where repair fits later).

That validator is the ancestor of this effort. Prosodio brings the **visual**
surface (the Corpora tab shows problems at a glance) but its scan/probe logic is
braided into the web app — not callable from a script, not pointable at another
corpus root. This doc defines the consolidation: one validation core, grown
here, that eventually replaces `nx-audiobook`'s validator. The preparation
pipeline itself stays in `nx-audiobook` for now.

## The three corpora

- **fixtures** — public, committed (`fixtures/`).
- **private** — the curated production library (via config).
- **staging** — the `nx-audiobook` prep area (the instance library, or any hop
  of its pipeline); validated read-only, in place.

Named corpora are conveniences — the core takes any root, as `nx-audiobook`'s
`-r` flag does today.

## Scope

**In:** pass/fail checks with warnings, over any of the three corpora. **Out:**
metadata enrichment (series/narrator/…), the preparation pipeline (conversion,
audiobookshelf conformance), bookId changes, and any cleanup off the validation
path.

Repair is out for now, not forever: correctable defects may later get a
**fix/apply step, properly gated**, following the Reconciliation convention
([coding-style.md](../coding-style.md) — desired vs actual, converge,
idempotent; kin to backlog `sanity-reconcilers`). Not before parity.

## Shape

One pointable core (a package; server-side — it needs `fs` + `ffprobe`) takes a
corpus root and emits findings. Two thin skins consume it: the CLI and the web
server. The browser only ever receives serialized findings — it never runs
validation. This is the seam that un-braids validation from the web app.

## Milestones

1. **Bootstrap** — the CLI exists and validates a corpus root, emitting
   findings. _(done 2026-07-19: `bun run validate <name-or-path>` —
   `apps/validate-cli` over `packages/corpus` + `packages/config`; findings
   carry `severity`, pass = zero failures)_
2. **nx-audiobook parity** — the `checkfiles` + `apps/validate` rules brought
   over **vetted, not copied**. _(done 2026-07-20: strays [tightened
   case-insensitive, m4b-only corpus], hygiene trio [.DS_Store, perms 644/755,
   xattr with `com.apple.provenance` tolerance], mtime hints [basename-keyed
   flat JSON in `data/validate/mtime/`, second granularity, absent/mismatch =
   failure, orphan = warning, `--record-mtimes`], duration, missing-author;
   author/title + cover checks retired as superseded; naming deferred to the
   keyword-cue convention. Private corpus: PASS 955/955. Retiring the nx
   validator itself is Daniel's call after a real staging cycle.)_
3. **vtt / alignment** — validation extends to VTT and alignment artifacts.
   These sources live outside the audiobook corpora (`data/transcribe/output`,
   `VTT_DIR` override) and `nx-audiobook` has no knowledge of them — excluded
   until parity lands. _(not started)_

## Where it grows

Beyond parity: richer epub/vtt/alignment checks and cross-corpus comparison.
Every rule is a finding on the same channel the Corpora tab already renders.
Validations also accumulate declared **exceptions/expectations** as they are
found — a known deviation (e.g. a legitimately abridged pair) reads as
acknowledged, not failed; `align-known-mismatch-convention` is the emerging
exemplar. Backlog items that hang off this doc: `merge-nx-audiobook-validation`
(milestone 2), `epub-calibre-pollution-audit`,
`align-known-mismatch-convention`, `align-soft-basename-match`,
`corpora-omnibus-mapping`.
