# Coding style

Code conventions that agents and humans do not adopt by default, so we state
them explicitly. This file will grow; for now it captures the one that matters
most.

## Top-down: calling code precedes called code

Order a file so a reader meets the entry point first and descends into detail,
rather than scrolling past helpers to find what runs. The caller appears above
the callee.

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

This reads like a newspaper: headline first, then the supporting detail. It is
the opposite of the bottom-up "define everything before you use it" habit.

## Source

Adapted from ai-garden `bun-one/AGENTS.md` (`## Code Structure`).
