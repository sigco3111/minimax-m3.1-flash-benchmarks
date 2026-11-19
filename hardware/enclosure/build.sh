#!/usr/bin/env bash
#
# Renders the enclosure STLs from the parametric source.
#
#   ./build.sh                 uses `openscad` from PATH
#   OPENSCAD=/path/to/OpenSCAD ./build.sh
#
# The model is verified afterwards with check_model.py.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENSCAD="${OPENSCAD:-openscad}"

if ! command -v "$OPENSCAD" >/dev/null 2>&1 && [ ! -x "$OPENSCAD" ]; then
    echo "error: openscad not found." >&2
    echo "       install it (macOS: brew install --cask openscad) or set OPENSCAD=/path/to/OpenSCAD" >&2
    exit 2
fi

echo "==> rendering the bottom shell"
"$OPENSCAD" -o "$HERE/rec1_bottom.stl" -D 'part="bottom"' "$HERE/rec1_case.scad"

echo "==> rendering the face panel"
"$OPENSCAD" -o "$HERE/rec1_top.stl" -D 'part="top"' "$HERE/rec1_case.scad"

echo "==> geometry self check"
python3 "$HERE/check_model.py"
