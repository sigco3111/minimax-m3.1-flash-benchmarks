#!/usr/bin/env bash
#
# Installs the exact tool chain the REC-1 firmware is verified against.
#
#   core    : rp2040:rp2040 @ 6.4.0   (Arduino "Raspberry Pi Pico/RP2040/RP2350")
#   libs    : Adafruit SSD1306 2.5.17, Adafruit GFX Library 1.13.0,
#             Adafruit BusIO 1.17.4
#
# Everything is installed into $ARDUINO_HOME (default ~/.cache/rec1-arduino),
# nothing outside this project is touched.
set -euo pipefail

ARDUINO_HOME="${ARDUINO_HOME:-$HOME/.cache/rec1-arduino}"
export ARDUINO_DIRECTORIES_DATA="$ARDUINO_HOME/data"
export ARDUINO_DIRECTORIES_DOWNLOADS="$ARDUINO_HOME/staging"
export ARDUINO_DIRECTORIES_USER="$ARDUINO_HOME/user"
mkdir -p "$ARDUINO_DIRECTORIES_DATA" "$ARDUINO_DIRECTORIES_DOWNLOADS" "$ARDUINO_DIRECTORIES_USER"

CORE_SPEC="rp2040:rp2040@6.4.0"
CORE_INDEX="https://github.com/earlephilhower/arduino-pico/releases/download/6.4.0/package_rp2040_index.json"
LIBS=(
    "Adafruit SSD1306@2.5.17"
    "Adafruit GFX Library@1.13.0"
    "Adafruit BusIO@1.17.4"
)

if ! command -v arduino-cli >/dev/null 2>&1; then
    echo "error: arduino-cli not found." >&2
    echo "       install it from https://arduino.github.io/arduino-cli/latest/installation/" >&2
    exit 2
fi

echo "==> updating the package index"
arduino-cli core update-index --additional-urls "$CORE_INDEX"

echo "==> installing $CORE_SPEC"
arduino-cli core install "$CORE_SPEC" --additional-urls "$CORE_INDEX"

echo "==> installing the libraries"
for lib in "${LIBS[@]}"; do
    arduino-cli lib install "$lib" --additional-urls "$CORE_INDEX"
done

echo
arduino-cli core list
arduino-cli lib list
echo
echo "done - now run ./build.sh"
