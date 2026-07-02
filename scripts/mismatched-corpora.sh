#!/usr/bin/env bash
# mismatched-corpora.sh — find m4b files whose sibling epub doesn't match
#
# Inside the corpora directory, books are organised as:
#   <series?>/<book-folder>/<basename>.m4b
#   <series?>/<book-folder>/<basename>.epub    ← should share basename
#
# This script finds cases where:
#   1. An .m4b file exists in a leaf folder
#   2. At least one .epub exists in the SAME folder
#   3. But NONE of those .epub files share the .m4b's basename
#
# These are naming mismatches that prevent basename-based joining.
#
# Usage:
#   ./mismatched-corpora.sh                 # all roots
#   ./mismatched-corpora.sh -r fixtures     # only fixtures
#   ./mismatched-corpora.sh -r private      # only private
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── roots ────────────────────────────────────────────────────────────────────
declare -A CORPORA
CORPORA[fixtures]="$REPO_ROOT/fixtures/audiobooks"
CORPORA[private]="/Volumes/Space/Reading/audiobooks"
ROOT_ORDER=(fixtures private)

ONLY_ROOT=""

usage() {
  echo "Usage: $0 [-r all|fixtures|private] [-h]"
  echo ""
  echo "Find .m4b files in corpora whose sibling .epub doesn't share the same basename."
  echo "Only reports folders that HAVE at least one .epub but none matching the .m4b."
  echo ""
  echo "Options:"
  echo "  -r ROOT    Scan one root or all (default: all)"
  echo "  -h         Show this help"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r) ONLY_ROOT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# "all" is the same as no filter
[[ "$ONLY_ROOT" == "all" ]] && ONLY_ROOT=""

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

# ── main ─────────────────────────────────────────────────────────────────────
scan_root() {
  local name="$1"
  local corpora="${CORPORA[$name]}"

  echo ""
  echo "━━━ $name ━━━"
  echo "  corpora: $corpora"
  echo ""

  if [[ ! -d "$corpora" ]]; then
    echo -e "  ${YELLOW}⚠ directory not found (skipping)${RESET}"
    return
  fi

  local perfect=0 mismatched=0 no_epub=0

  while IFS= read -r m4b; do
    local dir base
    dir=$(dirname "$m4b")
    base=$(basename "$m4b" .m4b)

    # Check for matching epub (perfect match)
    if [[ -f "$dir/$base.epub" ]]; then
      perfect=$((perfect + 1))
      continue
    fi

    # Check if there are ANY .epub files in this folder
    local sibling_epubs
    sibling_epubs=$(find "$dir" -maxdepth 1 -name "*.epub" -type f 2>/dev/null || true)

    if [[ -z "$sibling_epubs" ]]; then
      # No epubs at all — not a mismatch, just missing
      no_epub=$((no_epub + 1))
      continue
    fi

    # MISMATCH: has epub(s), but none match the m4b basename
    mismatched=$((mismatched + 1))
    echo -e "  ${RED}✗${RESET} $base"
    echo -e "    ${DIM}m4b:${RESET}  $(basename "$m4b")"
    while IFS= read -r epub; do
      echo -e "    ${YELLOW}epub:${RESET} $(basename "$epub")"
    done <<< "$sibling_epubs"
    echo ""

  done < <(find "$corpora" -name "*.m4b" -type f | sort)

  echo "  ── summary ──"
  echo -e "  ${GREEN}perfect:    $perfect${RESET}  (m4b + matching epub)"
  echo -e "  ${RED}mismatched: $mismatched${RESET}  (epub present but basename differs)"
  echo -e "  ${DIM}no epub:    $no_epub${RESET}  (m4b only, no epub at all)"
}

for root in "${ROOT_ORDER[@]}"; do
  if [[ -n "$ONLY_ROOT" && "$root" != "$ONLY_ROOT" ]]; then
    continue
  fi
  scan_root "$root"
done
