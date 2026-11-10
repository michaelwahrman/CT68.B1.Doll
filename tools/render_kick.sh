#!/bin/bash
# Render exported .ass scenes with the Linux kick (run in WSL from the CT68.A4.Doll folder):
#   bash tools/render_kick.sh dolls_rest dolls_raised dolls_rest_uv
KICK=${KICK:-/mnt/c/Users/micha/Downloads/arnold/bin/kick}
cd "$(dirname "$0")/.."
for p in "$@"; do
  "$KICK" </dev/null -i "exports/$p.ass" -r ${RES:-1280 720} -dw -dp -sl -set options.abort_on_license_fail false -o "exports/$p.png" -v 1 2>&1 \
    | grep -E 'ERROR|WARNING|render done in' | grep -v -E 'compiled against|watermarks'
done
