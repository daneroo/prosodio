# Alignment source-location design failure

Status: problem statement and replacement constraints; no proposed
implementation

This document records a design failure discovered while adding exact VTT-to-EPUB
playback visualization. It describes the underlying alignment data model, not
the discarded browser synchronization spike.

## Intended model: index the non-normalized native source

Alignment compares two ordered streams of normalized tokens:

1. Parse each source without losing its native structure.
2. While traversing that non-normalized structure, record the native source
   range that produced each token.
3. Normalize the token text for matching while carrying its native source range
   forward unchanged.
4. Match only normalized token sequences.
5. Resolve a match directly through each token's retained native source range.

Normalization is lossy. The index must address the original, non-normalized
source in coordinates native to that format. It must be captured before or
during normalization and cannot be reconstructed from normalized text.

The two source projections should conceptually look like this:

```ts
interface SourceToken<Locator> {
  norm: string;
  source: Locator;
}

type VttToken = SourceToken<VttTextRange>;
type EpubToken = SourceToken<EpubDomRange>;
```

The matcher may flatten these token tables into arrays, but flattening must not
replace the native source indexes.

A native source index is specifically not:

- an offset in the normalized token array;
- a character offset in normalized text;
- a character offset in a synthetic flattened EPUB string;
- an excerpt to search for later.

## Matcher coordinates are not source locators

The existing matcher returns:

```ts
interface MatchedSpan {
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
}
```

These are half-open indexes into the flat normalized VTT and EPUB token arrays.
They are useful and appropriate inside the matching algorithm:

```ts
vtt.tokens.slice(span.vttStart, span.vttEnd);
epub.tokens.slice(span.epubStart, span.epubEnd);
```

They are not positions in a VTT file, cue, EPUB document, normalized string, or
DOM tree. In particular, `epubStart` is a token-array index, not a character
offset.

The mistake is not that the matcher uses flat sequence ranges. The mistake is
allowing those ranges, plus incomplete derived addresses, to become the only
durable connection back to the sources.

For an exact span, token `vttStart + i` corresponds to token `epubStart + i`.
Each side must then resolve through its own token table:

```ts
const vttSource = vtt.tokens[span.vttStart + i].source;
const epubSource = epub.tokens[span.epubStart + i].source;
```

## VTT native source index

A normalized VTT token should retain a range in its original cue text:

```ts
interface VttTextRange {
  cueIndex: number;
  start: number;
  end: number;
}
```

`start` and `end` must use a documented coordinate unit; for the current
TypeScript implementation this should be half-open UTF-16 string offsets.

`wordIndex` is useful presentation metadata but is not sufficient as a source
locator. Normalization may split punctuation, apostrophes, hyphens, or other raw
text in ways that make a normalized token index differ from a human notion of a
word.

The current in-memory VTT sequence retains `cueIndex` and `wordIndex`. The
uncommitted spike also added `rawStart` and `rawEnd`, which is closer to the
required locator. However, the serialized `AlignmentResult` persists only the
flat span ranges and approximate time bounds; it does not persist or otherwise
define how a consumer obtains the VTT token source ranges.

The correct VTT projection must retain this native cue-text range on every
normalized token. A consumer must not recover it by searching or by indexing a
normalized aggregate string.

## EPUB native source index

An EPUB is an ordered spine of content documents. A normalized EPUB token must
retain a range in that structure. The range may begin and end in different text
nodes, for example:

```html
<p><em>hel</em>lo</p>
```

The normalized token `hello` crosses two DOM text nodes. An element-only or
single-node locator cannot represent it.

The intended EPUB index is a DOM-structural range captured during the original
content-document traversal:

```ts
interface EpubDomPoint {
  spineIndex: number;
  spineHref: string;
  /** childNodes indexes from a defined content-document root to a Text node. */
  nodePath: number[];
  /** UTF-16 offset in that Text node. */
  offset: number;
}

interface EpubDomRange {
  start: EpubDomPoint;
  end: EpubDomPoint;
}
```

The exact root and path semantics must be specified. Paths must index
`childNodes`, not only element children, because endpoints are Text nodes.

This is conceptually close to an EPUB CFI range. The intended canonical form is
the simpler child-index path because it is created directly during DOM traversal
and remains inspectable. An EPUB CFI may later be generated for an epub.js
consumer, but it is a downstream encoding of this native range, not the
alignment source index.

Parser parity is a separate requirement. A child-index path assumes the server
and browser parsers produce compatible trees. That assumption may be acceptable
given the existing parser-parity evidence, but it must be explicit and tested.
If it fails, assertions, element IDs, text context, or CFI behavior may provide
recovery; normalized offsets are not a substitute for resolving the parser
difference.

## What the current implementation actually preserves

The current EPUB extraction builds:

```ts
interface EpubToken {
  norm: string;
  seq: number;
  spineIndex: number;
  tokenIndex: number;
}
```

`tokenIndex` points into a normalized token array for a spine document. That
normalized token retains raw character offsets into a flattened `visibleText`
string. The extraction then destroys the parsed EPUB DOM. No text-node path or
DOM range survives.

The serialized result adds this derived address to each span:

```ts
interface EpubTextAddress {
  spineIndex: number;
  spineHref: string;
  start: number;
  end: number;
}
```

`start` and `end` are character offsets in the spine's normalized, flattened
text stream. They are not DOM indexes and cannot be inverted on their own.

The written Epoch 4 design explicitly selected this representation and stated
that a viewer would rebuild the same normalized-to-raw map against its own DOM.
It also explicitly excluded DOM identity, child-index paths, and CFIs from the
address. The implementation therefore follows the written design here. The
written design is the source of the failure.

It was correct to keep DOM details out of the matching algorithm. It was not
correct to omit the native DOM indexes from the extraction token table and
replace them with normalized-string offsets at the consumer boundary.

## Why normalized offsets are insufficient

Normalization can:

- change case and Unicode representation;
- remove or replace punctuation;
- collapse arbitrary separators;
- split one raw region into several tokens;
- join text across inline element boundaries;
- discard excluded content.

Consequently, a normalized offset has meaning only alongside the exact raw
projection and the exact normalized-to-raw map that produced it.

Re-running projection and normalization in another parser can sometimes recreate
that map, but that is not inversion. It is a second extraction whose result is
assumed to be identical. A local expected-word assertion catches some drift, but
repeated words can satisfy that assertion at the wrong location.

The custom flattened `visibleText` projection also inserts synthetic boundaries
around a hand-maintained list of block elements because native `textContent`
would concatenate adjacent blocks. That rule may be useful tokenization policy,
but it further demonstrates that a normalized character offset is relative to an
invented projection rather than the EPUB DOM itself.

## Required separation of concerns

The replacement design must keep three layers distinct.

### 1. Native source indexing

Each source produces an ordered token table while traversing its original,
non-normalized structure:

- normalized token text for matching;
- native source index for rendering or review;
- optional diagnostic raw text and timing.

The native source index is created during traversal and survives normalization
unchanged. It never points into a normalized or flattened intermediate string.

### 2. Matching

The matcher consumes only normalized token strings and returns half-open ranges
over the two token tables. It remains independent of cues, DOM nodes, paths, and
CFIs.

### 3. Consumer join

A consumer resolves matched token offsets through the retained native source
indexes. It may decorate cues, seek audio, recreate a DOM `Range` by following
the stored child-node paths, or ask epub.js to create an EPUB CFI. These are
projections of the native indexes, not responsibilities of the matcher.

No per-cue or per-token presentation model should be expanded on the server and
transported merely to make this join. The browser applies the retained VTT and
EPUB native indexes to the corresponding original sources; it does not derive
new locators by re-normalizing or searching flattened text.

## Serialization questions that must be answered

Before further implementation, decide explicitly:

1. How are the native VTT and EPUB token-index tables serialized without
   expanding them into a UI-specific response?
2. What extraction version, configuration, and source fingerprint prove that a
   consumer is applying the indexes to the same source structure used by the
   matcher?
3. What exact content-document root and `childNodes` path semantics define the
   EPUB DOM index?
4. How are ranges crossing text nodes and spine boundaries represented?
5. What assertions detect parser-tree drift without silently relocating to a
   repeated word?
6. Which data is canonical alignment output, and which data is a disposable UI
   projection?

These questions are upstream alignment-contract questions. They should not be
answered inside `AlignmentViewer` or `EpubReader`.

## Evidence from the discarded synchronization spike

The spike is not a proposed design, but it established several useful facts:

- epub.js can create and render a range CFI whose endpoints are not aligned to
  element boundaries;
- a matched word crossing inline nodes can be represented by a DOM `Range` and
  EPUB CFI range;
- exact active-token highlighting is a viable UI;
- rebuilding normalized offsets against the browser DOM worked on the tested
  books, but depended on the flawed identical-projection assumption;
- expanding 134,322 VTT tokens into a server-generated UI response produced a
  31.12 MB plain JSON object and approximately 60.5 MB over the TanStack server
  function transport.

Those observations define tests and constraints for a replacement. They do not
justify retaining the spike's transport or locator model.

## Replacement acceptance criteria

A replacement is acceptable only if:

- every normalized VTT token resolves to an exact original cue-text range;
- every normalized EPUB token retains exact DOM range endpoints captured during
  traversal of the original, non-normalized EPUB content document;
- a matched token pair can be resolved without searching normalized prose or
  guessing from excerpts;
- matches spanning cues or multiple EPUB text nodes remain representable;
- the matcher continues to use compact flat token ranges;
- the browser does not receive a server-expanded per-token UI model;
- parser or extraction drift fails explicitly rather than silently highlighting
  a plausible repeated word;
- the serialized alignment result clearly distinguishes matching coordinates,
  native source indexes, and presentation data.
