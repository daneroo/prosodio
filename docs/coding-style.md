# Coding style

Conventions agents don't adopt by default. Will grow.

## Dates: ISO 8601, no exceptions

Every date or timestamp a human sees — UI, logs, reports, filenames — is ISO
8601 (`2026-07-12T03:24:56` / `2026-07-12T03:24:56Z`). Locale formats
(`7/12/2026, 3:24:56 AM`) are banned; never call `toLocaleString`,
`toLocaleDateString`, or `toLocaleTimeString` on a Date.

- Storage and wire: full ISO 8601 with timezone, prefer UTC `Z`
  (`toISOString()`).
- Presentation may omit or transform the timezone (e.g. render local time, drop
  the offset). The `T` separator is preferred; it may be omitted for readability
  in some cases (a space, per RFC 3339's concession). The `YYYY-MM-DD HH:mm:ss`
  field order never changes.
- One shared formatter per app surface (bookplayer:
  `src/components/lab/format.ts`), so the rule has a single enforcement point.

## Top-down: caller before callee

Entry point first, helpers below.

```txt
// ENTRY POINT
if (import.meta.main) {
  await main();
}

// MAIN
async function main(): Promise<void> {
  await tokenize();
  await buildIndex();
  await findAnchors();
  await score();
}

async function tokenize(): Promise<void> {
  // Convert cues to words
}
```

## Staging: specific files, never `git add -A`

Stage the files you changed, by name; never `git add -A`/`git add .`. A
Calibre-modified fixture epub once rode into a code commit this way — a bookmark
file silently changed the epub's sha256, caught only because the fixture
manifest's hash check failed later. When a commit touches binaries or fixtures,
read `git diff --cached` before committing.

## Reconciliation: desired vs actual

Where it fits, model state as desired vs actual and converge — not one-shot
imperative mutation.

- Represent desired state.
- Read or compute actual state.
- Reconcile the diff; make it idempotent and re-runnable.
