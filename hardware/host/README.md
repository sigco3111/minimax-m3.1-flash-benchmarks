# REC-1 host bridge

The program that connects the USB controller to OBS Studio.

* **Device side:** the RP2040 shows up as a USB CDC serial port
  (`/dev/tty.usbmodemXXXX` on macOS/Linux, `COMx` on Windows).
* **OBS side:** obs-websocket 5.x (built into OBS Studio 28+; enable it in
  *OBS → Tools → WebSocket Server Settings*).
* **No third party packages.** The WebSocket client and the serial port
  handling are part of this directory and use only the Python standard
  library (Python 3.8+).

## Run

```bash
# 1. find the port
python3 host/bridge.py --list-ports

# 2. start OBS, enable the WebSocket server (default port 4455)

# 3. start the bridge
export OBS_WS_PASSWORD='your obs-websocket password'   # only if you enabled auth
python3 host/bridge.py --port /dev/tty.usbmodem14101 \
                       --obs-host 127.0.0.1 --obs-port 4455 \
                       --scenes "Intro,Gameplay,Outro"
```

Options:

| Option | Meaning |
|--------|---------|
| `--port` | serial device of the controller (or put it in the config file) |
| `--list-ports` | print the serial devices that look like a controller |
| `--config` | JSON file, see `config.example.json` |
| `--obs-host`, `--obs-port` | obs-websocket endpoint (default 127.0.0.1:4455) |
| `--obs-password-env` | name of the environment variable with the password (default `OBS_WS_PASSWORD`) |
| `--scenes` | comma separated scene cycle order |
| `--status-interval` | how often the state is pushed to the device (default 0.25 s) |
| `--log-level` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

**The password is never read from a file.** If the obs-websocket server has
authentication enabled and the environment variable is empty, the bridge stops
with a clear message instead of guessing.

## Windows

The POSIX serial implementation uses `termios` and does not work on Windows.
Install `pyserial` there and the bridge will use it automatically:

```powershell
pip install pyserial
python host\bridge.py --port COM7
```

## Protocol

The device talks a line protocol (ASCII, `\n` terminated, max 63 bytes).

```
device -> host
  HELLO <proto> <fw>                    boot / re-sync announcement
  CMD  <REC|SCENE> <TOGGLE|NEXT> <seq>  a command with a sequence number
  PING <seq>                            liveness probe (every second)

host -> device
  PONG <seq>
  ST   LINK <0|1>                       host bridge connected
  ST   OBS  <0|1>                       obs-websocket connected
  ST   REC  <0|1>                       OBS *real* record state
  ST   TIME <seconds>                   recording duration reported by OBS
  ST   SCENE <name>                     current program scene
  ACK  <REC|SCENE> <seq> <OK|ERR|DUP>   command acknowledgement
```

Rules:

* Every command carries a sequence number that the device increments. The
  host drops a command whose number is not larger than the last one it
  processed and answers `DUP` — a replayed line can never toggle the
  recorder twice.
* `HELLO` resets that window, so a rebooted device (counter back at 1) is
  accepted again.
* The host pushes the status four times per second, so the screen is always
  within 250 ms of reality.

## Tests

```bash
python3 -m unittest discover -s host/tests -v
```

The tests use a **mock obs-websocket server** (`mock_obs.py`) and a
**simulated device** (`device_sim.py`), so they run without any hardware and
without OBS. They cover the protocol parser, the duplicate suppression, the
out-of-order rejection, the scene cycle, the status push, the end-to-end
button → OBS → status path and the WebSocket framing.

Expected: `Ran 14 tests ... OK`.

## Files

| File | Purpose |
|------|---------|
| `bridge.py` | the application and its CLI |
| `websocket.py` | minimal RFC 6455 client |
| `obs.py` | obs-websocket 5.x client |
| `serial_link.py` | serial port (termios / pyserial) |
| `device_protocol.py` | Python mirror of the wire protocol |
| `device_sim.py` | simulated device for tests |
| `mock_obs.py` | mock obs-websocket server for tests |
| `tests/test_bridge.py` | the test suite |
