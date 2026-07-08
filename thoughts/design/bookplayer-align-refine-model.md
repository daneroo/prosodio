# bookplayer-align — refine alignment model

Status: proposed post-merge design task.

The current bookplayer alignment branch proves token-level audio ↔ transcript ↔
EPUB synchronization, but the data model is not the model we want to keep. It
mixes matcher coordinates, source-native addresses, transport encoding, and UI
presentation concerns. That makes the browser payload larger than it should be,
the client contract harder to understand, and EPUB location failures difficult
to reason about.

This should be addressed after `bookplayer-align` merges. The current branch
fixes usability; this design task should make the alignment representation
durable.

## Problem

Alignment has three different jobs:

1. Match normalized VTT tokens to normalized EPUB tokens.
2. Preserve native source addresses so a match can be mapped back to real VTT
   cue text and real EPUB DOM ranges.
3. Serve browser playback efficiently: time → token → transcript row + EPUB
   range.

The current representation blurs those jobs.

- Transport is still too tied to presentation. The browser should receive
  compact, indexed data, not a rich server-built UI model.
- VTT identity is reconstructed from flattened token offsets instead of being a
  first-class native cue-text range.
- EPUB identity depends on fragile DOM-path parity between server extraction and
  EPUB.js browser parsing. Failures are now diagnosed, but the contract is still
  not explicitly designed around robustness.
- `packages/align`, `apps/align`, and `apps/bookplayer` consume overlapping
  slices of the same data without a clean versioned boundary between matcher
  output, source indices, and bookplayer presentation.

## Desired model

Separate the alignment artifact into layers:

### 1. Matcher coordinates

The pure alignment result:

- normalized VTT token sequence;
- normalized EPUB token sequence;
- accepted match spans;
- unmatched/gap spans;
- metrics.

This layer should remain stable, deterministic, and useful to `apps/align`.

### 2. Native source indices

Durable addresses back into the original sources.

The exact representation is not settled. These are examples of the kind of
native addresses the model needs to preserve, not proposed final types:

```ts
type VttTokenAddress = {
  cueIndex: number;
  startOffset: number;
  endOffset: number;
  startSec: number;
  endSec: number;
};
```

```ts
type EpubTokenAddress = {
  spineIndex: number;
  startSegment: number;
  startOffset: number;
  endSegment: number;
  endOffset: number;
};
```

Where a segment is a distinct text-node DOM path within one spine document.
Segments are stored once per spine; tokens reference them by integer id.

Open representation questions:

- Should ranges use `startOffset + endOffset` or `startOffset + length`?
- Is any field redundant once cue/span/token tables are columnar?
- Should time live on every VTT token address, or in a parallel time table?
- Should EPUB addresses be DOM segment references, prebuilt CFIs, or another
  equivalent locator?
- Can EPUB CFIs be constructed reliably at extraction time, before EPUB.js has
  parsed the book in the browser?

The final representation should be selected against these criteria:

- simplicity of construction at extraction time;
- reliable repeatability across extraction and browser environments / DOM
  parsers;
- compactness over transport for 100k+ token books;
- direct usefulness in the browser hot path, especially
  `EpubTokenAddress → DOM Range → epubcfi → display/highlight`;
- debuggability when a locator fails;
- minimal redundancy without making the consumer perform expensive joins.

### 3. Browser transport

A compact, versioned wire format optimized for browser access patterns:

- columnar typed-array fields for token times, cue indices, EPUB token ids, and
  offsets;
- shared string tables for cue text / token text only where needed;
- per-spine segment tables for EPUB DOM path resolution;
- explicit schema version and feature flags.

The browser should be able to answer these quickly:

- `currentTime → active VTT token`;
- `active VTT token → cue row + token highlight`;
- `active VTT token → matched EPUB token`;
- `matched EPUB token → DOM Range → CFI → display/highlight`.

### 4. Presentation model

Derived in the browser or server from the compact artifact, not stored as the
canonical alignment model.

Examples:

- transcript cue rows;
- matched/unmatched token styling;
- gap marker rows;
- coverage labels.

## Robust EPUB location

EPUB location should fail loudly and specifically.

The resolver should report at least:

- missing spine section;
- DOM segment path mismatch;
- offset outside text node;
- generated range text mismatch;
- CFI/display failure.

The browser may skip highlighting when validation fails, but it should not
silently highlight a plausible repeated word. The UI only needs a small warning;
the console/log payload should contain the detailed reason.

## Implementation plan

1. Write the versioned artifact contract in `packages/align`.
2. Add tests for VTT token addresses and EPUB segment/token addresses during
   extraction.
3. Update `apps/align` to emit/read the new artifact without changing matcher
   semantics.
4. Update bookplayer decoding to consume the new compact model directly.
5. Keep the current UI behavior, but derive cue rows from the new model.
6. Add targeted locator tests around representative EPUB DOM structures: split
   inline text, punctuation, repeated words, and malformed/problem books where
   available.

## Non-goals

- Redesigning the matcher.
- Building a full browser-test harness as part of the first model refactor.
- Solving every private-book locator failure before the model boundary is clean.
- Returning to excerpt search as the primary EPUB locator.

## Acceptance

- Payload is smaller or no larger than the current compact transport for long
  books.
- `apps/align` and bookplayer consume the same versioned artifact contract.
- Time-to-active-token lookup remains O(log n) or better.
- Token → EPUB range resolution is explicit, cached by spine, and diagnostic on
  failure.
- Existing bookplayer behavior remains: virtualized transcript/alignment views,
  active token highlight, audio seek, EPUB follow, and visible locate warning.
