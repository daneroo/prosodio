#!/usr/bin/env bash
set -euo pipefail

# Run from apps/transcribe
if [[ ! -f "transcribe.ts" ]]; then
  echo "Run this script from apps/transcribe"
  exit 1
fi

# Paths resolve from this script's own location so it works regardless of cwd.
# Input is a committed public fixture (scripts/fetch-and-check-fixtures.ts);
# output goes to the volatile repo-root data/transcribe (see lib/config.ts).
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SELF_DIR/../../../.." && pwd)"

INPUT="$ROOT_DIR/fixtures/audio/alice-30m.m4b"
OUTPUT_DIR="$ROOT_DIR/data/transcribe/output/demo"

echo "== Whisper demo: full run (no cache) =="
bun run transcribe.ts -i "$INPUT" -m tiny.en --output "$OUTPUT_DIR" --tag demo-full --no-cache

echo "" # extra blank line to separate the output
echo "== Whisper demo: segmented concat run (no cache) =="
bun run transcribe.ts -i "$INPUT" --segment 10m -m tiny.en --output "$OUTPUT_DIR" --tag demo-seg-10m --no-cache

echo "" # extra blank line to separate the output
echo "== Whisper demo: segmented clip run (no cache) =="
bun run transcribe.ts -i "$INPUT" --segment 10m --duration 25m -m tiny.en --output "$OUTPUT_DIR" --tag demo-seg-10m-dur25m --no-cache

echo "== Demo outputs =="
ls -ltr "$OUTPUT_DIR"
