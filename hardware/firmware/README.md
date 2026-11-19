# REC-1 firmware

Device side of the controller: an Adafruit QT Py RP2040 that turns button
presses into numbered commands and renders the state the host reports.

## Layout

```
firmware/
  rec_controller/
    config.h            pins, timings, I2C address (every value annotated)
    protocol.h/.cpp     line protocol, portable (no Arduino dependency)
    buttons.h/.cpp      debounce + command sequence, portable
    ui.h/.cpp           OLED rendering and indicator state
    rec_controller.ino  setup() and loop()
  test/
    test_portable.cpp   host side unit test of protocol + debounce
    Makefile
  setup.sh              installs the pinned core and libraries
  build.sh              compiles (and optionally flashes)
```

## Build

```bash
cd firmware
./setup.sh        # once: arduino-cli core rp2040:rp2040@6.4.0 + 3 libraries
./build.sh        # -> firmware/build/rec_controller.ino.uf2
```

`build.sh` compiles for `rp2040:rp2040:adafruit_qtpy:flash=8388608_0`
(8 MB flash, no filesystem) with `--warnings all`. The verified result is
73 412 bytes of flash (0.9 %) and 9 788 bytes of RAM (3.7 %).

## Unit test of the portable logic

The protocol parser and the debouncer do not depend on Arduino, so they can
be compiled and run on the host:

```bash
make -C test test
```

Expected output: `all firmware portable tests passed`.

## Flashing

Two ways:

1. **UF2 (no tool needed):** hold the `BOOTSEL` button on the board, plug in
   USB-C, release `BOOTSEL`. The board appears as a mass storage device
   (`RPI-RP2`). Copy `firmware/build/rec_controller.ino.uf2` onto it. The
   board reboots into the new firmware.
2. **arduino-cli:**

   ```bash
   PORT=/dev/ttyACM0 ./build.sh --upload
   ```

   The RP2040 has no USB serial bridge, so this uses the UF2 boot loader
   (`picotool` inside the core) and the port is only used for the reboot.

## Flashing notes for the creator

* The firmware talks to the host over the **same** USB-C cable that powers
  the board (native CDC, no driver needed on macOS/Linux; Windows 10/11 has
  a built-in CDC ACM driver).
* The NeoPixel on the board is switched off in hardware terms: the firmware
  never initialises it and the power pin stays low, so it does not draw
  current.
* If the screen stays black, check the I²C address (0x3C by default) and that
  the display is plugged into the STEMMA QT port (I²C1), not into a header.
