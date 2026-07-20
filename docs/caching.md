# Caching

Derived artifacts are cached, never treated as source. Principles, with the
bookplayer alignment artifact as the worked example.

## Principles

- **Caches live under `data/<app>/`** (gitignored, volatile — see
  [file-layout.md](file-layout.md)). A wiped cache must always rebuild from the
  real inputs; nothing downstream may depend on a cache existing.
- **Keyed by a fingerprint of the inputs**, so a stale entry is detectable
  without trusting it — mtime + size (cheap) or a content hash (rename-stable,
  costlier). Compare the fingerprint on every read; on mismatch, rebuild.
- **Versioned.** A schema or semantics change bumps a version that invalidates
  every entry at once — an unchanged fingerprint would otherwise serve
  stale-shaped data. The bump is the invalidation tool; there is one client, so
  it is never a compatibility promise.
- **Always revalidate, never trust blindly.** Serve the cache only after the
  fingerprint/version check passes; a fast not-modified path is fine, a skipped
  check is not.

## Worked example: the alignment artifact

`apps/bookplayer` caches each book's VTT↔EPUB alignment as three files under
`data/bookplayer/cache/`: `<bookId>.alignment.json`, a `.json.gz` for transport,
and a `.key.json` staleness sidecar. It is served with
`ETag: W/"a<schemaVersion>-<vttMtimeMs>-<epubMtimeMs>"` and always revalidated
(304 fast path on an ETag hit). The three values in that ETag are exactly its
fingerprint: bump the schema, or touch either source file, and the entry
rebuilds.

The library index cache (`data/bookplayer/cache/index.json`) follows the same
shape — a `BookCache.version` integer that a metadata-shape change bumps, over
per-book m4b fingerprints (see `packages/corpus` / bookplayer `library.ts`).
