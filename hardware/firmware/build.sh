#!/usr/bin/env bash
#
# REC-1 firmware build.
#
#   ./build.sh            compile only
#   ./build.sh --upload   compile and flash over USB (BOOTSEL + reset)
#
# Requires: arduino-cli 1.6.0+ and the pinned core (see setup.sh).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKETCH="$HERE/rec_controller"
BUILD="$HERE/build"

FQBN="${FQBN:-rp2040:rp2040:adafruit_qtpy:flash=8388608_0}"
PORT="${PORT:-}"

ARDUINO_DIRECTORIES_DATA="${ARDUINO_DIRECTORIES_DATA:-$HOME/.cache/rec1-arduino/data}"
ARDUINO_DIRECTORIES_DOWNLOADS="${ARDUINO_DIRECTORIES_DOWNLOADS:-$HOME/.cache/rec1-arduino/staging}"
ARDUINO_DIRECTORIES_USER="${ARDUINO_DIRECTORIES_USER:-$HOME/.cache/rec1-arduino/user}"
export ARDUINO_DIRECTORIES_DATA ARDUINO_DIRECTORIES_DOWNLOADS ARDUINO_DIRECTORIES_USER

mkdir -p "$BUILD"

echo "==> compiling $SKETCH"
echo "    FQBN: $FQBN"
arduino-cli compile \
    --fqbn "$FQBN" \
    --warnings all \
    --export-binaries \
    --build-path "$BUILD" \
    "$SKETCH"

echo
echo "==> artifacts"
ls -l "$BUILD"/*.uf2 "$BUILD"/*.elf 2>/dev/null || true

if [ "${1:-}" = "--upload" ]; then
    if [ -z "$PORT" ]; then
        echo "error: set PORT=/dev/ttyACM0 (or similar) to flash" >&2
        exit 2
    fi
    echo
    echo "==> flashing to $PORT"
    arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir "$BUILD" "$SKETCH"
fi
