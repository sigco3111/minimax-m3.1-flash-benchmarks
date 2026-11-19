# REC-1 — desk recording controller — requirements

Version 1.0 (design data, not yet built)

A small USB desk controller that a creator presses to start/stop the recording
in OBS Studio, that shows the real recording state, and that makes the state
of the link visible.

---

## 1. Scope

### 1.1 In scope

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R1 | One physical button starts and stops the OBS recording. | Pressing the button toggles the OBS record state; the host reports `ST REC` back to the device. |
| R2 | A red indicator shows that a recording is running. | The LED is lit **only** while the host has confirmed `output_active == true` from OBS. It is dark when the button was merely pressed and the confirmation has not arrived. |
| R3 | A small screen shows the recording time and the connection state. | The OLED shows `HH:MM:SS` (from OBS), `LINK:UP/DOWN`, `OBS:UP/DOWN`, the current scene and a status banner. |
| R4 | A button switches the OBS scene. | The button asks the host for the next scene; the host calls `SetCurrentProgramScene` and pushes the new name back to the screen. |
| R5 | USB is the connection to the computer. | The device is a USB CDC device (native USB on the RP2040); no radio, no battery, no mains input anywhere in the design. |
| R6 | A broken link is stated explicitly. | If the host stops talking for 2 s the screen shows `LINK:DOWN` / `HOST LINK LOST`; if obs-websocket is gone it shows `OBS:DOWN` / `OBS NOT CONNECTED`. |
| R7 | The device is built from an off-the-shelf MCU board. | The MCU is the Adafruit QT Py RP2040 (product 4900) with the official arduino-pico core 6.4.0 variant `rp2040:rp2040:adafruit_qtpy`. |
| R8 | Every part is orderable today and documented by its manufacturer. | See `BOM.csv`; each line carries the manufacturer product page and the spec that the design relies on. |
| R9 | Mechanical dimensions come from the manufacturer, not from guesses. | Every dimension in `enclosure/dims.scad` is annotated with its source; the four values that are *not* published are marked as assumptions in `enclosure/README.md`. |
| R10 | Button handling is robust. | Bounce is filtered (25 ms), one press produces exactly one command, a replayed command line is ignored by the host. |
| R11 | The device recovers from reconnection. | Unplugging and re-plugging the USB cable re-establishes the link within ~2 s and the screen shows the current OBS state again. |
| R12 | The host bridge has no third party dependency. | `host/` uses only the Python standard library (own WebSocket client, own serial port handling). |
| R13 | The design is reproducible. | `firmware/setup.sh` installs the pinned core and libraries, `firmware/build.sh` compiles, `enclosure/build.sh` renders the STLs. |
| R14 | No credentials in the repository. | The obs-websocket password is read from an environment variable, never written to a file in this project. |

### 1.2 Explicitly out of scope

* Wireless (Wi-Fi/Bluetooth) — the RP2040 radio is not used, the board has none.
* Battery or mains power — the device is powered from the USB-C port only.
* A custom PCB. A PCB is the natural next step for production (see
  `ARCHITECTURE.md` §7), but no PCB layout is delivered here and **no
  manufacturing-readiness is claimed**.
* Streaming/encoder control, audio mixing, multi-PC control, mobile apps.

---

## 2. Power budget

All numbers are calculated from the published data of the parts; no
measurement on real hardware was possible (see `VERIFICATION.md`).

| Consumer | Rail | Current | Source |
|----------|------|---------|--------|
| RP2040 core + USB CDC | 3V3 | 40 mA (worst case) | RP2040 datasheet typical operating current, used as the upper bound |
| QT Py board (LDO quiescent, USB pull-up) | 5 V → 3V3 | < 1 mA | AP2112K-3.3 quiescent current |
| OLED module (average) | 3V3 | 40 mA | Adafruit product 938: "on average the display uses about 40 mA" |
| OLED module (all pixels on) | 3V3 | 50 mA | measured practice value for the SSD1306 module |
| Red indicator LED | 3V3 | 5.9 mA | (3.3 V − 2.0 V) / 220 Ω |
| Buttons (internal pull-up) | 3V3 | < 0.1 mA | RP2040 internal pull-up ≈ 50–100 kΩ |
| **Total on the 3V3 rail (worst case)** | | **≈ 96 mA** | |
| **Total from USB 5 V** | | **≈ 96 mA** | the LDO passes the current through, minus its own quiescent current |

* The 3.3 V regulator on the QT Py is an AP2112K-3.3 (the board file lists
  `AP2112K-3.3`); Adafruit states that current revisions may ship a different
  regulator but that it can provide **at least 500 mA** — an order of magnitude
  more than the 96 mA budget.
* **USB current requirement:** ≈ 96 mA at 5 V (0.48 W). USB 2.0 allows
  100 mA for a bus-powered device without enumeration, so the controller works
  on a plain USB port; the board additionally advertises 250 mA in its USB
  descriptor (`usbpwr` = 250 mA in `boards.txt` of core 6.4.0).
* Heat: the LDO drops 1.7 V at 96 mA ≈ 0.16 W — the board needs no heatsink.
* The OLED is powered from the board's **3.3 V** (STEMMA QT pin 2). The module
  has its own regulator and level shifters, so 3.3 V in is the correct supply
  (Adafruit product 938: "the OLED itself requires a 3.3 V power supply").

---

## 3. Mechanical requirements

| ID | Requirement | Value |
|----|-------------|-------|
| M1 | Desk footprint | 96 × 58 mm, 21 mm high (plus the button caps) |
| M2 | Two printed parts | `rec1_bottom.stl` (tub) and `rec1_top.stl` (face panel), 4 × M3 screws |
| M3 | USB-C accessible | 8 × 4 mm slot in the back wall |
| M4 | OLED window | 35.6 × 24 mm opening, aligned with the 34.5 × 23 mm glass |
| M5 | Buttons | 2 × Ø6.05 mm press fit for 6.0 × 6.0 × 5.0 mm tact switches |
| M6 | LED | Ø3.2 mm hole, visible from the front |
| M7 | Panel fasteners | 4 × M3 nylon screws with nuts in the printed bosses (nut pockets) |
| M8 | OLED fasteners | 4 × M2.5 nylon screws with nuts in the printed posts |
| M9 | No sharp edges inside | all internal edges are rounded by the geometry, no additional requirement |

---

## 4. Software requirements

| ID | Requirement | Where |
|----|-------------|-------|
| S1 | Device firmware must compile without warnings. | `firmware/build.sh` (verified, see VERIFICATION.md) |
| S2 | Protocol parsing must be unit tested on the host. | `firmware/test/` (C++, standard library only) |
| S3 | The host bridge must be unit tested. | `host/tests/` (14 tests, `unittest`) |
| S4 | The CAD must be self checked. | `enclosure/check_model.py` (geometry assertions on the STL) |
| S5 | The preview must be driven by the same dimensions as the CAD. | `preview/sync_dims.py` generates `preview/dims.js` from `enclosure/dims.scad` |
| S6 | The obs-websocket password must never be stored. | `host/bridge.py` reads `OBS_WS_PASSWORD` from the environment |

---

## 5. Acceptance (what a real device must prove)

The full checklist is in `VERIFICATION.md` §5. In short, a build is accepted
when: the buttons trigger the right OBS action, the LED follows the *real*
record state, the screen shows the timer and both link states, unplugging the
USB cable produces an explicit "link lost" message within 2 s, and reconnecting
restores the state without a reboot.
