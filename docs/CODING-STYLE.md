# Coding style

Conventions agents don't adopt by default. Will grow.

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
