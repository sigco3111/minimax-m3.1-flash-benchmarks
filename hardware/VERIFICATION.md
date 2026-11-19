# REC-1 — verification report

Everything in this document was executed on the machine described in §1.
Everything that needs a physical device is listed in §5 and is **not**
claimed as verified.

---

## 1. Verification environment

| Item | Version / detail |
|------|------------------|
| Host | macOS 27.2.1 (arm64), Darwin 24.3.0 / kernel 27.2.0 |
| Compiler (host tests) | Apple clang 21.0.0 (`c++ -std=c++11 -Wall -Wextra -Werror`) |
| Python | 3.9.6 (standard library only) |
| Arduino CLI | 1.6.0 (installed into a temporary directory for this run) |
| MCU core | `rp2040:rp2040` 6.4.0 — "Raspberry Pi Pico/RP2040/RP2350" by Earle F. Philhower, III |
| Libraries | Adafruit SSD1306 2.5.17, Adafruit GFX Library 1.13.0, Adafruit BusIO 1.17.4 |
| CAD | OpenSCAD 2021.01 (headless, `openscad -o … -D 'part="bottom"'`) |
| Browser (preview) | Google Chrome, headless screenshot at 1920 × 1080 |

Two environment notes:

* OpenSCAD 2021.01 is an x86_64 build; Rosetta 2 was installed on the
  verification machine to run it (`softwareupdate --install-rosetta`). This
  changes the host system, not the project.
* The Arduino core and the libraries were installed into a temporary
  directory for this run. The reproducible procedure for a normal machine is
  `firmware/setup.sh` (installs the same pinned versions into
  `~/.cache/rec1-arduino`).

---

## 2. Verifications that were executed

### 2.1 Firmware compiles for the real board target

```bash
arduino-cli compile \
  --fqbn "rp2040:rp2040:adafruit_qtpy:flash=8388608_0" \
  --warnings all --export-binaries \
  --build-path firmware/build firmware/rec_controller
```

Output:

```
Sketch uses 73412 bytes (0%) of program storage space. Maximum is 8384512 bytes.
Global variables use 9788 bytes (3%) of dynamic memory, leaving 252356 bytes
for local variables. Maximum is 262144 bytes.
```

* No warnings with `--warnings all`.
* The FQBN `rp2040:rp2040:adafruit_qtpy` is the official board variant of
  the Adafruit QT Py RP2040 in core 6.4.0 (`arduino-cli board details` shows
  VID 0x239A / PID 0x80F7, `usbpwr` 250 mA).
* Artifacts: `rec_controller.ino.uf2` (180 736 B) and `rec_controller.ino.elf`.
* **Not verified:** that the UF2 image boots on real hardware, and that the
  OLED answers on the address/bus that the code assumes.

### 2.2 Portable firmware logic (protocol + debounce)

```bash
make -C firmware/test test
```

Output:

```
c++ -std=c++11 -Wall -Wextra -Werror -O1 -I../rec_controller -o test_portable \
    ../rec_controller/protocol.cpp ../rec_controller/buttons.cpp test_portable.cpp
./test_portable
all firmware portable tests passed
```

Covered: command serialisation and parsing, rejection of unknown commands and
of non-numeric flags, scene names with spaces, ping parsing, bounce
suppression, exactly one command per press, no auto-repeat while held,
release detection, increasing sequence numbers.

### 2.3 Host bridge test suite

```bash
python3 -m unittest discover -s host/tests -v
```

Output:

```
Ran 14 tests in 0.310s

OK
```

The tests run against a **mock obs-websocket 5.x server** (`host/mock_obs.py`)
and a **simulated device** (`host/device_sim.py`):

| Test | What it proves |
|------|----------------|
| `test_parse_command` / `test_parse_rejects_unknown_command` / `test_parse_ping_and_hello` / `test_status_block` | the wire format is parsed strictly |
| `test_record_toggle_reaches_obs` | a REC press reaches OBS as `ToggleRecord` and is acknowledged `OK` |
| `test_duplicate_command_is_dropped` | the same sequence number twice toggles **once**, the second one is answered `DUP` |
| `test_out_of_order_command_is_dropped` | an older sequence number is dropped |
| `test_hello_resets_the_dedupe_window` | after a device reboot (counter back to 1) the command is accepted again |
| `test_scene_cycles_in_order` | the scene cycle continues after the scene OBS currently shows |
| `test_ping_is_answered_and_status_is_pushed` | `PING` → `PONG` + status block |
| `test_status_reflects_the_real_record_state` | `ST REC` follows `GetRecordStatus`, not the button |
| `test_button_press_records_and_the_device_is_told` | end to end: simulated button → OBS → `ST REC 1` back to the device |
| `test_scene_button_switches_the_scene` | end to end: simulated button → `SetCurrentProgramScene` |
| `test_request_response_round_trip` | the hand written WebSocket client interoperates with the server implementation (handshake, masking, framing, JSON) |

### 2.4 Enclosure: render + geometry self check

```bash
cd enclosure && ./build.sh
```

OpenSCAD reports both parts as valid polyhedra (`Simple: yes`), and
`check_model.py` parses the exported STL meshes and asserts:

```
bottom shell
  ok   width is 96 mm (96.00)
  ok   depth is 58 mm (58.00)
  ok   floor starts at z=0 (0.00)
  ok   outer body height is 21 mm (21.00)
  ok   boss top / panel underside at z=18.5 (18.50)
  ok   solid volume is plausible (27292 mm3)
  ok   M3 boss pilot at (±41, ±22) ...
  ok   OLED post pilot at (±15.25, -14.5 / 13.5) ...
face panel
  ok   panel width is 90.8 mm (90.80)
  ok   panel depth is 52.8 mm (52.80)
  ok   panel underside at z=18.5 (18.50)
  ok   panel top incl. labels at z=21.4 (21.40)
  ok   button hole at (-28.0, -23) ...
  ok   LED hole at (0, -23) ...
  ok   screw clearance at (±41, ±22) ...
interference (from the dimension table)
  ok   OLED glass (18.2) clears the panel underside (18.5)
  ok   panel edge (45.4) fits the cavity wall (45.5)
  ok   QT Py stack clears the panel

all enclosure checks passed
```

This proves that the *model* is what the dimension table says. It proves
nothing about the printed part or about the real modules.

### 2.5 Preview renders

`preview/index.html` was loaded in headless Chrome at 1920 × 1080 and
captured (screenshot in the working session). The page draws the exploded
isometric view, the top view with the board placement, the simulated OLED
screen and the simulated protocol traffic. `node --check preview/app.js`
passes; `python3 preview/sync_dims.py` regenerates `preview/dims.js` from
`enclosure/dims.scad` (56 parameters).

### 2.6 Part data was checked against the manufacturers

* The Adafruit product pages listed in `BOM.csv` were fetched on 2026-11-19;
  the titles, prices and stock states in the BOM are copied from those
  pages.
* The QT Py RP2040 pin map was taken from the installed core
  (`variants/adafruit_qtpy/pins_arduino.h`, which cites Adafruit's official
  pinout asset) and cross-checked against the official Eagle board file
  (`adafruit/Adafruit-QT-Py-RP2040-PCB`) for the physical pad order.
* The obs-websocket protocol was implemented against the published protocol
  documentation of the obs-websocket 5.x branch.

---

## 3. What could **not** be verified here

| Item | Why |
|------|-----|
| Flashing the firmware onto a board | no RP2040 hardware available |
| The OLED answering on I²C1 at 0x3C | no display available |
| The buttons producing exactly one command each | no switches available (the debounce logic is unit tested instead) |
| The LED lighting up and the current through it | no LED available (the value is calculated: 5.9 mA) |
| The USB enumeration and the CDC throughput | no board available |
| The measured current of the whole device | no hardware, no USB current meter |
| Whether the printed parts fit the real modules | no parts, no printer |
| The bridge against a **real** OBS Studio | no OBS installation in this environment (the protocol is tested against the mock server) |
| Whether the USB-C plug overmould fits the 8 × 4 mm slot | the slot was sized from the standard receptacle aperture |
| The obs-websocket authentication handshake | the mock server does not implement the challenge/response (the client code path exists and is exercised only in the no-auth case) |

---

## 4. Limits of this verification

* The firmware was compiled, not executed. A compile proves the code is
  well-formed for the target; it does not prove the behaviour.
* The CAD check works on the exported mesh. It cannot see print tolerances,
  layer adhesion or the real component outlines.
* The host tests use mocks. They encode *my* understanding of the
  obs-websocket protocol — the same understanding that is in `host/obs.py`.
  A real OBS instance is the only independent check.
* The power budget is a calculation from published data, not a measurement.

---

## 5. Acceptance test list for the real device

To be executed after the first build. Every line is currently **untested**.

| # | Step | Expected result | Result |
|---|------|-----------------|--------|
| A1 | Plug the board into the computer with a USB-C cable | a `/dev/tty.usbmodem*` port appears; `python3 host/bridge.py --list-ports` lists it | |
| A2 | Start the bridge without OBS running | the screen shows `OBS:DOWN` / `OBS NOT CONNECTED`, the LED stays off | |
| A3 | Start OBS, enable the WebSocket server, start the bridge | the screen switches to `LINK:UP OBS:UP` and `READY` | |
| A4 | Press REC once | OBS starts recording; within ~300 ms the LED lights and the timer runs | |
| A5 | Press REC again | OBS stops recording; the LED goes out and the timer freezes at the last value | |
| A6 | Press REC and hold for 5 s | exactly one record start (no auto repeat) | |
| A7 | Press SCENE | the scene in OBS advances by one; the screen shows the new name | |
| A8 | Stop the bridge while recording | within 2 s the screen shows `HOST LINK LOST` and the LED goes dark | |
| A9 | Restart the bridge | within ~2 s the screen shows the real OBS state again (and `RECORDING` if OBS still records) | |
| A10 | Unplug the USB cable | the device screen shows `LINK:DOWN` (the host bridge also reports the serial error) | |
| A11 | Re-plug the USB cable | the device re-announces itself, the bridge answers, the state is correct again | |
| A12 | Play a recorded file in OBS and press REC | the LED follows OBS, not the button: it stays off while OBS is not recording even if the button was pressed | |
| A13 | Restart OBS while the bridge runs | the bridge reconnects, `ST OBS 1` returns, the screen recovers | |
| A14 | Measure the current at the USB-C plug with the OLED bright and the LED on | below 100 mA (budget: ≈ 96 mA) | |
| A15 | Assemble the case and check that the USB-C plug goes in | the plug fits the 8 × 4 mm slot without force | |
| A16 | Assemble the case, press both buttons | the switches sit firmly and are not pushed in by the panel | |
| A17 | Assemble the case and look at the screen at an angle | the OLED glass is fully visible through the window | |
| A18 | Leave the device recording for 10 minutes | no heat problem, no USB disconnect, the timer is still running | |
| A19 | Flash a second time over UF2 | the board comes back with the new firmware, the settings persist | |
| A20 | Press REC with OBS closed | the screen shows `OBS NOT CONNECTED`, the LED stays off, no crash | |

---

## 6. Open risks

| Risk | Impact | Mitigation / next step |
|------|--------|------------------------|
| The OLED glass might not sit at the top of its PCB (assumption 1 in `enclosure/README.md`) | the window would show part of the PCB | check the module and adjust `win_y` in `dims.scad`, re-render |
| The 100 mm STEMMA QT cable may be too short or too long for the final routing | the cable does not reach | the cable route is not fixed by the case; shorten it or use the 50 mm version (4399) |
| The 6 mm switch press fit may be too tight or too loose depending on the printer | the switch falls out or does not fit | 6.05 mm hole; increase to 6.2 mm or add adhesive |
| The USB-C plug overmould may be thicker than the standard aperture | the plug does not fit the 8 × 4 mm slot | enlarge the slot in `dims.scad` |
| The QT Py board has no mounting holes | it can move in the cradle | the cradle plus the USB plug's strain relief hold it; a production version needs a PCB or a clip |
| obs-websocket authentication was never exercised | the bridge may fail against an authenticated server | test against a real OBS with authentication enabled (acceptance step A3 with a password) |
| Windows needs `pyserial` | the bridge does not open the port | documented in `host/README.md` |
