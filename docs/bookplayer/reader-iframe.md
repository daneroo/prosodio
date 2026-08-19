# Reader iframe: events and script posture

Why the reader iframe runs with `allow-scripts` while EPUB scripts still never
execute, and what any future change here must preserve.

Code: `EpubReader.tsx` (the `renderTo` call and the `spine.hooks.serialize`
registration) and `lib/epub-sanitize.ts` (+ its tests), both under
`apps/bookplayer/src/`.

## The constraint

epub.js renders each section into an `about:srcdoc` iframe it sandboxes itself:
`iframe.sandbox = "allow-same-origin"`, adding `allow-scripts` only when the
`allowScriptedContent` option is set (`epubjs/src/managers/views/iframe.js`).

Safari and iPadOS deliver **no events at all** to listeners bound on a
same-origin sandboxed iframe's document unless `allow-scripts` is present —
[WebKit bug 218086](https://bugs.webkit.org/show_bug.cgi?id=218086). This is not
specific to our code: epub.js binds its own event forwarding the same way
(`contents.js`, `document.addEventListener` per `DOM_EVENTS`), so without the
flag `rendition.on("click"|"touchstart"|…)` is equally dead on those platforms.

Observed 2026-08-19 on a real iPad: the host document received every touch,
pointer, mouse and click event; the content document received none of any kind.
Desktop Chrome never reproduces it, and **synthetic touch events in a desktop
browser cannot detect it** — they exercise our detection logic, not WebKit's
iframe event gating.

## The posture

The sandbox bit is all-or-nothing: one flag governs both our listeners and the
book's own scripts. The standing decision (Daniel, 2026-08-19) is that enabling
it is permitted **only** to make events work, never to let book scripts run.

Since the flag cannot express that, a `spine.hooks.serialize` hook enforces it.
That hook runs on the serialized section string _before_ it becomes the iframe's
srcdoc, so nothing executable ever reaches the document:

- `<script>` is **retyped**, not deleted — `type` becomes a MIME no browser
  executes.
- inline `on*` handlers are removed.
- `javascript:` URLs are defused.

### Why retype instead of delete

Deleting script elements would shift element indices in the rendered document
away from the capture-parse document. The word-activate gesture maps a rendered
point to a CFI and resolves it back into that detached parse; a structural
divergence breaks it. Elements carry an index, attributes do not — hence retype
the elements, remove the attributes.

**Any future change to this transform must keep `<script>` element count and
position identical.** The unit tests assert exactly that.

## What this is not

A hostile-input sanitizer. It is a string transform over serialized markup, a
defense-in-depth layer for a personal, locally-owned corpus. If the library ever
ingests untrusted books, this needs a real parser and a fresh threat model.

Validated 2026-08-19 against every script-bearing book in the private corpus (7
of 633 — Kobo reader shims, one `book.js` with `onload=`, `javascript:` links):
264 documents, 34 scripts, zero executable remnants, element counts unchanged.
