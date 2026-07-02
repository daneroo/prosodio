#!/usr/bin/env bash
# match-vtt.sh — find aligned (vtt, epub, m4b) triplets
#
# For each .vtt in a transcriptions directory, look for an .m4b and .epub
# with the same basename inside the corresponding corpora directory.
#
# The corpora tree can be arbitrarily nested; the transcriptions dir is flat.
# The join key is the basename (filename without extension).
#
# Happy-path layout:
#
#   transcriptions/                                           (flat)
#   ├── Author - Series 01 - Title One.vtt
#   └── Author - Series 02 - Title Two.vtt
#          ↕ basename
#   corpora/                                                  (nested)
#   └── Author - Series/
#       ├── Author - Series 01 - Title One/
#       │   ├── Author - Series 01 - Title One.m4b
#       │   └── Author - Series 01 - Title One.epub
#       └── Author - Series 02 - Title Two/
#           ├── Author - Series 02 - Title Two.m4b
#           └── Author - Series 02 - Title Two.epub
#
# Usage:
#   ./match-vtt.sh                 # all roots, all books
#   ./match-vtt.sh -v              # verbose — show mismatch details
#   ./match-vtt.sh -s "banks"      # filter by search terms
#   ./match-vtt.sh -r fixtures     # only the fixtures root
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── roots ────────────────────────────────────────────────────────────────────
declare -A CORPORA TRANSCRIPTIONS
CORPORA[fixtures]="$REPO_ROOT/fixtures/audiobooks"
TRANSCRIPTIONS[fixtures]="$REPO_ROOT/fixtures/transcriptions"
CORPORA[private]="/Volumes/Space/Reading/audiobooks"
TRANSCRIPTIONS[private]="$REPO_ROOT/data/transcribe/output"
ROOT_ORDER=(fixtures private)

# ── options ──────────────────────────────────────────────────────────────────
SEARCH=""
ONLY_ROOT=""
VERBOSE=false

usage() {
  echo "Usage: $0 [-v] [-s \"search terms\"] [-r all|fixtures|private] [-h]"
  echo ""
  echo "Discover aligned (vtt, epub, m4b) triplets by basename."
  echo ""
  echo "Options:"
  echo "  -v         Verbose — show mismatch details"
  echo "  -s TERMS   Filter basenames (all words must match, case-insensitive)"
  echo "  -r ROOT    Scan one root or all (default: all)"
  echo "  -h         Show this help"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--verbose) VERBOSE=true; shift ;;
    -s) SEARCH="$2"; shift 2 ;;
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
  local transcriptions="${TRANSCRIPTIONS[$name]}"

  echo ""
  echo "━━━ $name ━━━"
  echo "  corpora:        $corpora"
  echo "  transcriptions: $transcriptions"
  echo ""

  if [[ ! -d "$corpora" ]]; then
    echo -e "  ${YELLOW}⚠ corpora dir not found (skipping)${RESET}"
    return
  fi
  if [[ ! -d "$transcriptions" ]]; then
    echo -e "  ${YELLOW}⚠ transcriptions dir not found (skipping)${RESET}"
    return
  fi

  # Index all .m4b files by basename for fast lookup
  declare -A m4b_by_base
  while IFS= read -r path; do
    local base
    base=$(basename "$path" .m4b)
    m4b_by_base["$base"]="$path"
  done < <(find "$corpora" -name "*.m4b" -type f)

  # Walk .vtt files, join by basename
  local matched=0 no_m4b=0 no_epub=0 filtered=0
  local vtts
  vtts=$(find "$transcriptions" -name "*.vtt" -type f | sort)

  while IFS= read -r vtt; do
    [[ -z "$vtt" ]] && continue
    local base
    base=$(basename "$vtt" .vtt)

    # Apply search filter
    if [[ -n "$SEARCH" ]]; then
      local match=true
      for word in $SEARCH; do
        if ! echo "$base" | grep -qi "$word"; then
          match=false
          break
        fi
      done
      if ! $match; then
        filtered=$((filtered + 1))
        continue
      fi
    fi

    # Look up m4b
    local m4b="${m4b_by_base[$base]:-}"
    if [[ -z "$m4b" ]]; then
      if $VERBOSE; then
        echo -e "  ${RED}✗${RESET} ${DIM}$base${RESET}"
        echo -e "    vtt:  $(basename "$vtt")"
        echo -e "    ${RED}m4b:  (not found in corpora)${RESET}"
      fi
      no_m4b=$((no_m4b + 1))
      continue
    fi

    # Look for epub sibling
    local dir
    dir=$(dirname "$m4b")
    local epub="$dir/${base}.epub"
    if [[ ! -f "$epub" ]]; then
      if $VERBOSE; then
        echo -e "  ${YELLOW}△${RESET} $base"
        echo -e "    vtt:  $(basename "$vtt")"
        echo -e "    m4b:  $m4b"
        echo -e "    ${YELLOW}epub: (not found — basename mismatch or missing)${RESET}"
        # Show what epubs ARE there
        local sibling_epubs
        sibling_epubs=$(find "$dir" -maxdepth 1 -name "*.epub" -type f 2>/dev/null || true)
        if [[ -n "$sibling_epubs" ]]; then
          while IFS= read -r e; do
            echo -e "    ${DIM}  has: $(basename "$e")${RESET}"
          done <<< "$sibling_epubs"
        fi
      fi
      no_epub=$((no_epub + 1))
      continue
    fi

    # Perfect match
    echo -e "  ${GREEN}✓${RESET} $base"
    matched=$((matched + 1))
  done <<< "$vtts"

  echo ""
  echo "  ── summary ──"
  echo -e "  ${GREEN}matched:  $matched${RESET}"
  if [[ $no_epub -gt 0 ]]; then
    if $VERBOSE; then
      echo -e "  ${YELLOW}no epub:  $no_epub${RESET}"
    else
      echo -e "  ${YELLOW}no epub:  $no_epub${RESET}  ${DIM}(use -v to show)${RESET}"
    fi
  fi
  if [[ $no_m4b -gt 0 ]]; then
    if $VERBOSE; then
      echo -e "  ${RED}no m4b:   $no_m4b${RESET}"
    else
      echo -e "  ${RED}no m4b:   $no_m4b${RESET}  ${DIM}(use -v to show)${RESET}"
    fi
  fi
  if [[ $filtered -gt 0 ]]; then echo -e "  ${DIM}filtered: $filtered${RESET}"; fi
}

for root in "${ROOT_ORDER[@]}"; do
  if [[ -n "$ONLY_ROOT" && "$root" != "$ONLY_ROOT" ]]; then
    continue
  fi
  scan_root "$root"
done
