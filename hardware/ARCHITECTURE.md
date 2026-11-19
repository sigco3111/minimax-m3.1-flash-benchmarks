# REC-1 — architecture

```
  ┌──────────────────────────┐        USB CDC (115200)        ┌──────────────────────────┐
  │  REC-1 device            │◀──────────────────────────────▶│  host/bridge.py          │
  │  QT Py RP2040            │   line protocol, ASCII, \n     │  (python3, stdlib only)  │
  │                          │                                │                          │
  │  2 buttons (debounced)   │  CMD REC TOGGLE <seq>          │  obs-websocket 5.x       │
  │  1 red LED               │  CMD SCENE NEXT  <seq>         │        │                 │
  │  1.3" SSD1306 OLED       │  PING <seq>                    │        ▼                 │
  │  (I2C1 / STEMMA QT)      │                                │  OBS Studio              │
  └──────────────────────────┘  ◀───────────────────────────   └──────────────────────────┘
                                PONG <seq>
                                ST LINK|OBS|REC <0|1>
                                ST TIME <s>
                                ST SCENE <name>
                                ACK <cmd> <seq> OK|ERR|DUP
```

The split is deliberate: **the device owns the physical interface, the host
owns the OBS side.** The device never talks to OBS itself (no radio allowed),
and the host never guesses the device state — it reports what OBS really says.

---

## 1. Hardware blocks

| Block | Part | Why this part |
|-------|------|---------------|
| MCU | Adafruit QT Py RP2040 (4900) | Native USB (CDC, no driver), RP2040 with 264 kB RAM, tiny (17.8 × 21.8 mm), STEMMA QT connector, castellated pads, official arduino-pico core variant. |
| Display | Adafruit 1.3" 128×64 OLED (938) | SSD1306 over I²C, STEMMA QT, 34.5 × 23 mm glass, auto-reset, documented mounting holes, 3.3 V. |
| Buttons | Omron B3F-1000 6 mm tact (367) | Cheap, ubiquitous, defined body size, panel mount by press fit. |
| LED | 3 mm diffused red (777) | Wide viewing angle, panel mount, defined Ø3.0 body. |
| Resistor | 220 Ω 1/4 W (2780) | LED current limiting: 5.9 mA. 330 Ω is not sold by Adafruit, 220 Ω is the closest available value. |
| Cable | STEMMA QT JST SH 4, 100 mm (4210) | The display connects to the MCU with one plug; no soldering on the display. |
| Case | 3D print, 2 parts | OpenSCAD source + STL, dimensioned from the manufacturer data. |

Full list with official links and prices: `BOM.csv`.

### 1.1 Pin map (QT Py RP2040)

Source: `rp2040:rp2040` core 6.4.0 →
`variants/adafruit_qtpy/pins_arduino.h`, which itself cites Adafruit's
official pinout (learn.adafruit.com asset 100337). The physical pad order
comes from the official Eagle board file in
`Adafruit/Adafruit-QT-Py-RP2040-PCB`.

| Function | Pad (silkscreen) | Arduino pin | GPIO | Note |
|----------|------------------|-------------|------|------|
| REC button | A2 (JP1 pad 3) | 27 | 27 | input, internal pull-up, active low |
| SCENE button | A3 (JP1 pad 4) | 26 | 26 | input, internal pull-up, active low |
| Record LED | A1 (JP1 pad 2) | 28 | 28 | output, 220 Ω to GND |
| OLED I²C | STEMMA QT pin 3/4 | `Wire1` | SDA 22 / SCL 23 | **I2C1**, the connector of this board |
| OLED supply | STEMMA QT pin 2 | 3V3 | – | from the board LDO |
| Common GND | JP3 pad 6 | GND | – | |

The breakout pads are free: A0 (29), A1 used as LED, A2/A3 used as buttons,
SDA (24), SCL (25), TX (16), RX (5), SCK (6), MISO (4), MOSI (3).

---

## 2. Firmware (`firmware/rec_controller`)

| File | Responsibility |
|------|----------------|
| `config.h` | every pin, timing and I²C constant, each with its provenance |
| `protocol.h/.cpp` | portable line protocol: serialise + parse (no Arduino dependency) |
| `buttons.h/.cpp` | debounce, one command per press, global sequence counter |
| `ui.h/.cpp` | screen rendering + indicator state |
| `rec_controller.ino` | setup, main loop, USB link handling |

### 2.1 Debounce and command generation

`DebouncedButton` implements a time based debounce: the raw pin state must be
stable for `BTN_DEBOUNCE_MS` (25 ms) before it is accepted. A press edge
emits exactly one event; holding the button does **not** repeat. The global
counter `NextSeq()` hands out a monotonically increasing sequence number with
every command.

### 2.2 Device state machine

```
            ┌──────────────┐   host traffic seen   ┌──────────────┐
            │  LINK DOWN   │ ────────────────────▶ │   LINK UP    │
            │ "HOST LINK   │                       │              │
            │    LOST"     │ ◀──────────────────── │              │
            └──────────────┘   2 s without traffic  └──────────────┘
                                                   │
             ┌──────────────┐  ST OBS 0             │  ST OBS 1
             │  OBS DOWN    │ ◀─────────────────────┴──────────────┐
             │ "OBS NOT     │                                       │
             │  CONNECTED"  │                       ┌──────────────┴──┐
             └──────────────┘                       │ RECORDING / IDLE │
                                                   │  LED on only for │
                                                   │  ST REC 1        │
                                                   └──────────────────┘
```

The LED follows **only** `ST REC 1`. A button press alone never lights it;
while the confirmation is outstanding the screen shows `WAITING FOR OBS...`.

### 2.3 USB link handling

* The device never blocks on `Serial` — it starts, shows the screen and waits
  for the host. (If the host app is not running, the device still boots and
  displays `LINK:DOWN`.)
* Every second the device sends `PING <seq>`; the host answers `PONG <seq>`
  plus a full status snapshot.
* If no host traffic arrives for `HOST_LINK_TIMEOUT_MS` (2 s) the device
  declares the link down, clears the recording state (it can no longer know
  it) and shows the failure.
* On boot and on every `HELLO` the device announces itself; the host resets
  its duplicate-suppression window so that a rebooted device (sequence
  counter back to 1) is accepted again.

---

## 3. Host bridge (`host/`)

| File | Responsibility |
|------|----------------|
| `bridge.py` | the application: serial link, command dispatch, status push, CLI |
| `websocket.py` | minimal RFC 6455 client (handshake, masking, fragmentation, ping) |
| `obs.py` | obs-websocket 5.x client (Hello/Identify, requests, events) |
| `serial_link.py` | serial port: POSIX `termios` implementation, `pyserial` fallback |
| `device_protocol.py` | Python mirror of the wire protocol |
| `device_sim.py` | simulated device (tests) |
| `mock_obs.py` | mock obs-websocket server (tests) |
| `tests/test_bridge.py` | 14 unit / integration tests |

### 3.1 Command path

1. The device sends `CMD REC TOGGLE 12`.
2. The bridge checks the sequence number: `seq <= last_seq` → the command is
   dropped and answered with `ACK REC 12 DUP`. This is the protection against
   a replayed or duplicated line toggling the recorder twice.
3. Otherwise the bridge calls the OBS request (`ToggleRecord`,
   `SetCurrentProgramScene`) and answers `ACK REC 12 OK` or `... ERR`.
4. Independently of the acknowledgement, the bridge polls
   `GetRecordStatus` four times per second and pushes the *observed* state
   (`ST REC`, `ST TIME`) to the device. The screen and the LED therefore
   always follow reality, never the button.

### 3.2 Scene cycling

The bridge keeps an ordered scene list (from `--scenes` or the config file).
On the first switch it asks OBS for the current program scene and continues
after it, so the button always advances to the *next* scene. Without a
configured list the OBS scene list is used.

### 3.3 Reconnection

* **Serial**: if the port disappears, the reader thread stops, the bridge
  closes everything and the main loop re-opens the port every 2 s.
* **obs-websocket**: the reader thread notices a closed socket; the bridge
  keeps running, pushes `ST OBS 0` and re-connects.
* **Device**: after re-plugging, the device's `HELLO`/`PING` is answered with
  a full snapshot, so the screen is correct again within ~1 s.

### 3.4 Security

The obs-websocket password is read from the environment variable named by
`--obs-password-env` (default `OBS_WS_PASSWORD`). If the server requires
authentication and no password is available, the bridge refuses to connect
with a clear message. No credential is ever written to disk by this project.

---

## 4. Enclosure (`enclosure/`)

* `dims.scad` — the single source of truth for every dimension, each annotated
  with the manufacturer source (or marked as an assumption).
* `rec1_case.scad` — the parametric model (`part = "bottom" | "top" | "both"`).
* `rec1_bottom.stl`, `rec1_top.stl` — the printable parts.
* `check_model.py` — parses the STLs and asserts the features (positions,
  diameters, clearances) so that a CAD edit cannot silently break the design.

Stack (Z axis):

```
 21.0 ── top of the face panel (+ 0.4 mm embossed labels)
 18.5 ── underside of the face panel = top of the corner bosses
 18.2 ── OLED glass surface
 12.0 ── OLED module bottom (10 mm posts above the floor)
  3.6 ── QT Py board bottom (1.6 mm cradle)
  2.0 ── inner floor
  0.0 ── outside of the case
```

---

## 5. Preview (`preview/`)

A self-contained page (no external assets, no network) that draws the case in
an isometric exploded view, the board placement in a top view, and a
simulation of the OLED and the LED. The assembly slider drives the explosion
so the video can be captured as an assembly animation. The dimensions come
from `preview/dims.js`, generated from `enclosure/dims.scad` by
`preview/sync_dims.py`, so the drawing cannot drift away from the CAD.

Everything in the preview is a simulation — it is explicitly labelled as such
in the page header.

---

## 6. Alternatives that were considered

| Decision | Alternative | Why not |
|----------|-------------|---------|
| Host bridge over USB CDC | USB HID | HID would need a second report protocol and a HID library on the host; CDC gives a readable text protocol, is driver-free on macOS/Linux and on Windows 10/11 (built-in CDC ACM driver). |
| Host bridge over USB CDC | obs-websocket directly from the MCU over Wi-Fi | Wireless is excluded by the requirements, and the RP2040 board has no radio. |
| `ToggleRecord` request | `StartRecord`/`StopRecord` | The device cannot know the current state; a toggle lets the host drive the transition from the *observed* state. The host re-reads `GetRecordStatus` anyway. |
| 4 Hz status polling | obs-websocket events only | Events alone would miss state changes that happened while the bridge was disconnected; polling makes the displayed state self-healing. |
| Hand written WebSocket client | `websocket-client` / `websockets` | Keeps the host tool dependency-free, which matters for a tool that has to run next to OBS on a creator's machine. |
| Printed boss + hex nut | heat-set inserts | No insert part needed and the parts can be reprinted; the nut pocket is printed. |
| Two printed parts | one part with a sliding lid | Simpler to print, simpler to assemble, no risk of the OLED module being trapped. |

---

## 7. Next step to production

The prototype is wired on castellated pads with short wires. A production
version would use a small PCB that carries the buttons, the LED and the
regulator-less wiring between the MCU and the display. Such a PCB design is
**not** part of this delivery: no layout, no DRC, no fabrication data were
produced, so no manufacturing-readiness is claimed anywhere in this project.
The wiring table (`WIRING.md`) and the pin map above are the input for such a
design.

---

## 8. File map

```
REQUIREMENTS.md    product requirements, power budget, acceptance
ARCHITECTURE.md    this file
BOM.csv            parts with official sources and prices
WIRING.md          pin by pin wiring table + assembly notes
SCHEMATIC.svg      wiring diagram (generated by tools/make_schematic.py)
README.md          how to assemble, flash and run
VERIFICATION.md    what was verified, how, and what still needs hardware
firmware/          device firmware + build scripts + host unit test
host/              bridge application + mocks + tests
enclosure/         parametric CAD, STL, dimension table, geometry checker
preview/           local visualisation of the design
tools/             schematic generator
```
