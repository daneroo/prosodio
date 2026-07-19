# Coding style

Conventions agents don't adopt by default. Will grow.

## Dates: ISO 8601, no exceptions

Every date or timestamp a human sees — UI, logs, reports, filenames — is ISO
8601 (`2026-07-12 03:24:56` / `2026-07-12T03:24:56Z`). Locale formats
(`7/12/2026, 3:24:56 AM`) are banned; never call `toLocaleString`,
`toLocaleDateString`, or `toLocaleTimeString` on a Date.

- Storage and wire: full ISO 8601 with timezone (`toISOString()`).
- Presentation may omit or transform the timezone (e.g. render local time, drop
  the offset, use a space instead of `T`) — but only the timezone and separator,
  never the `YYYY-MM-DD HH:mm:ss` field order.
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

## Reconciliation: desired vs actual

Where it fits, model state as desired vs actual and converge — not one-shot
imperative mutation.

- Represent desired state.
- Read or compute actual state.
- Reconcile the diff; make it idempotent and re-runnable.
