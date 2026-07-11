# epub-calibre-pollution-audit — Calibre-polluted EPUBs across the corpora

why: Calibre's viewer silently adds `META-INF/calibre_bookmarks.txt` when it
opens a book, changing the epub's whole-file sha256 without touching book
content. It already caused a fixture provenance break (Alice epub, restored
2026-07-03).

- detector: `scripts/find-calibre-bookmarks.sh` (read-only; iterates both
  corpora roots, lists flagged epubs with mtime). Scan 2026-07-03: 141/591
  flagged under the audiobooks root, 167/711 under the Dropbox Ebook root.
- impact: book content intact (additive META-INF entry); the break is on
  whole-file sha256 provenance/dedup, NOT epub-validate spine hashes or
  alignment text extraction (META-INF is not a spine content document).
- decide: (a) strip the entry — re-zipping yields a NEW sha256, it does not
  restore the original unless a known-good source exists; (b) prevent recurrence
  (Calibre viewer setting / open books read-only); (c) whether to gate the
  manifest/fixture check on this in CI.
- relates: `bookplayer-calibre-html-locate` (Calibre CONVERSION quality, a
  different hazard from this bookmark pollution).

revisit-when: cleaning the corpus or hardening fixture provenance.
