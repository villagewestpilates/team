#!/bin/bash
# Runs every check there is and prints one line per group.
cd "$(dirname "$0")/.."
OUT="$1"
mkdir -p "$OUT/s2" "$OUT/s3" "$OUT/s4" "$OUT/s5" "$OUT/s6" "$OUT/look" "$OUT/edit" "$OUT/hdr" "$OUT/party"
run() { # name, script, folder
  node "tools/$2" "$OUT/$3" > "$OUT/all-$1.txt" 2>&1
  echo "$1 pass=$(grep -c '^PASS' "$OUT/all-$1.txt") fail=$(grep -c -E '^FAIL|Error|Timeout' "$OUT/all-$1.txt")"
  grep -E '^FAIL|Error|Timeout' "$OUT/all-$1.txt" | head -4
}
run home-and-reading stage2.js s2
run posting stage3.js s3
run team stage4.js s4
run resources stage5.js s5
run drafts-swipe drafts.js s6
run look-textsize look.js look
run edit-mode editmode.js edit
run header header.js hdr
run celebration celebrate.js party
node tools/tap.js 2>&1 | tail -2
node tools/server_test.js | tail -1
node tools/server_test_email.js | tail -1
