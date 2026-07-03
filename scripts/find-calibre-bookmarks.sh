#!/usr/bin/env bash
# find-calibre-bookmarks.sh — audit EPUBs for Calibre pollution
#
# Lists every EPUB under the configured roots whose zip contains
# META-INF/calibre_bookmarks.txt (Calibre writes that entry when it opens/reads
# a book, which changes the file's sha256 without touching the book content).
# Read-only: never opens any file for write, never modifies anything.
#
# stdout = flagged epub paths (pipeable, e.g. `> flagged.txt`).
# stderr = per-root headers, progress, summaries, and unreadable-zip warnings.
set -uo pipefail

ROOTS=(
  "/Volumes/Space/Reading/audiobooks"
  "/Users/daniel/Library/CloudStorage/Dropbox/A-Reading/Ebook"
)

TARGET="META-INF/calibre_bookmarks.txt"

scan_root() {
  local root="$1"
  echo "=== $root ===" >&2
  if [[ ! -d "$root" ]]; then
    echo "  (not found — skipping)" >&2
    return
  fi

  local found=0 total=0 unreadable=0 listing
  while IFS= read -r -d '' epub; do
    total=$((total + 1))
    listing=$(unzip -Z1 "$epub" 2>/dev/null) || {
      unreadable=$((unreadable + 1))
      echo "  UNREADABLE: $epub" >&2
      continue
    }
    # mtime of file as iso date
    mtime=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%S%z" "$epub")
    if grep -qxF "$TARGET" <<<"$listing"; then
      echo "- $mtime : $epub"
      found=$((found + 1))
    fi
  done < <(find "$root" -type f -iname '*.epub' -print0)

  printf '  scanned %d epub(s): %d flagged, %d unreadable\n' \
    "$total" "$found" "$unreadable" >&2
}

for root in "${ROOTS[@]}"; do
  scan_root "$root"
done
