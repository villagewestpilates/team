#!/bin/bash
# Runs every phone-width check and prints a pass and fail count for each stage.
cd "$(dirname "$0")/.."
OUT="$1"
mkdir -p "$OUT/s2" "$OUT/s3" "$OUT/s4" "$OUT/s5"
for n in 2 3 4 5; do
  node "tools/stage$n.js" "$OUT/s$n" > "$OUT/reg$n.txt" 2>&1
  echo "stage$n pass=$(grep -c '^PASS' "$OUT/reg$n.txt") fail=$(grep -c -E '^FAIL|Error|Timeout' "$OUT/reg$n.txt")"
  grep -E '^FAIL|Error|Timeout' "$OUT/reg$n.txt" | head -4
done
node tools/tap.js
