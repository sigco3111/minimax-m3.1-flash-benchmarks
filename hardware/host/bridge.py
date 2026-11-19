#!/usr/bin/env python3
"""REC-1 host bridge: USB controller <-> OBS Studio.

The bridge owns the OBS side of the product:

  * it receives numbered commands from the device over USB CDC
  * it drops duplicated commands (same or lower sequence number)
  * it talks obs-websocket 5.x and pushes the *real* record state, the
    recording duration, the current scene and the connection state back to
    the device, so the OLED and the red LED always show reality

Only the Python standard library is required.

    python3 host/bridge.py --port /dev/tty.usbmodem14101
    python3 host/bridge.py --list-ports

The obs-websocket password is never stored in this repository: it is read
from the environment variable named by --obs-password-env (default
OBS_WS_PASSWORD).
"""

import argparse
import json
import logging
import os
import queue
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import device_protocol  # noqa: E402
from obs import ObsClient, ObsError  # noqa: E402
from serial_link import SerialError, list_ports, open_serial  # noqa: E402

LOG = logging.getLogger("rec1")


class Bridge:
    """Glue between the device link and OBS."""

    def __init__(self, serial, obs, scenes=None, status_interval=0.25):
        self.serial = serial
        self.obs = obs
        self.scenes = list(scenes or [])
        self.status_interval = status_interval
        self._queue = queue.Queue()
        self._running = False
        self._last_seq = 0
        self._scene_index = -1
        self._current_scene = ""
        self._recording = False
        self._duration = 0.0
        self._thread = None

    # ------------------------------------------------------------ device --
    def handle_line(self, line):
        msg = device_protocol.parse_line(line)
        if msg is None:
            return
        kind = msg.get("kind")
        if kind == "hello":
            # The device rebooted: its sequence counter restarts at 1.
            self._last_seq = 0
            LOG.info("device hello (fw=%s)", msg.get("fw"))
            self.push_status()
        elif kind == "ping":
            self.serial.write(device_protocol.format_pong(msg["seq"]))
            self.push_status()
        elif kind == "cmd":
            self.handle_command(msg)
        elif kind == "log":
            LOG.info("device: %s", msg.get("text"))

    def handle_command(self, msg):
        seq = msg["seq"]
        name = msg["name"]
        if seq <= self._last_seq:
            LOG.warning("duplicate command ignored: %s %s seq=%d", name, msg["arg"], seq)
            self.serial.write(device_protocol.format_ack(name, seq, "DUP"))
            return
        self._last_seq = seq
        try:
            if name == "REC" and msg["arg"] == "TOGGLE":
                self.obs.request("ToggleRecord")
                LOG.info("record toggled")
            elif name == "SCENE" and msg["arg"] == "NEXT":
                self.cycle_scene()
            else:
                raise ObsError("unknown command %s %s" % (name, msg["arg"]))
            self.serial.write(device_protocol.format_ack(name, seq, "OK"))
        except ObsError as exc:
            LOG.error("command %s failed: %s", name, exc)
            self.serial.write(device_protocol.format_ack(name, seq, "ERR"))

    # --------------------------------------------------------------- OBS --
    def cycle_scene(self):
        scenes = self.scenes
        data = self.obs.request("GetSceneList")
        current = data.get("currentProgramSceneName", "")
        if not scenes:
            scenes = [s["sceneName"] for s in data.get("scenes", [])]
            self.scenes = scenes
        if not scenes:
            raise ObsError("OBS has no scenes")
        if self._scene_index < 0:
            # First switch: continue after the scene OBS is showing now.
            self._scene_index = scenes.index(current) if current in scenes else -1
        self._scene_index = (self._scene_index + 1) % len(scenes)
        name = scenes[self._scene_index]
        self.obs.request("SetCurrentProgramScene", {"sceneName": name})
        self._current_scene = name
        LOG.info("scene -> %s", name)

    def refresh_obs_state(self):
        """Reads the real record state from OBS (never guessed locally)."""
        if not self.obs.connected():
            self._recording = False
            self._duration = 0.0
            return
        try:
            data = self.obs.request("GetRecordStatus")
        except ObsError as exc:
            LOG.warning("GetRecordStatus failed: %s", exc)
            self._recording = False
            self._duration = 0.0
            return
        self._recording = bool(data.get("output_active"))
        self._duration = float(data.get("output_duration") or 0.0)

    def push_status(self):
        if not getattr(self.serial, "connected", False):
            return
        self.refresh_obs_state()
        self.serial.write(
            device_protocol.format_status(
                link=True,
                obs=self.obs.connected(),
                recording=self._recording,
                duration=self._duration,
                scene=self._current_scene,
            )
        )

    # ------------------------------------------------------------- loop --
    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._serial_loop, daemon=True)
        self._thread.start()
        return self

    def _serial_loop(self):
        buffer = b""
        while self._running:
            try:
                data = self.serial.read(0.05)
            except SerialError as exc:
                LOG.error("serial link lost: %s", exc)
                break
            if not data:
                continue
            buffer += data
            while b"\n" in buffer:
                raw, _, buffer = buffer.partition(b"\n")
                line = raw.strip()
                if line:
                    self._queue.put(line.decode("utf-8", "replace"))
        self._running = False

    def run(self):
        """Main loop; returns when the device link dies."""
        self.start()
        last_push = 0.0
        while self._running:
            try:
                line = self._queue.get(timeout=0.05)
            except queue.Empty:
                line = None
            if line:
                self.handle_line(line)
            now = time.monotonic()
            if now - last_push >= self.status_interval:
                last_push = now
                self.push_status()
        self.stop()
        return 0

    def stop(self):
        self._running = False
        try:
            self.serial.close()
        except Exception:
            pass


def load_config(path):
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def build_parser():
    parser = argparse.ArgumentParser(description="REC-1 host bridge (device <-> OBS)")
    parser.add_argument("--port", help="serial device of the controller")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--list-ports", action="store_true", help="list serial devices")
    parser.add_argument("--config", help="JSON config file (see config.example.json)")
    parser.add_argument("--obs-host", default="127.0.0.1")
    parser.add_argument("--obs-port", type=int, default=4455)
    parser.add_argument(
        "--obs-password-env",
        default="OBS_WS_PASSWORD",
        help="environment variable holding the obs-websocket password",
    )
    parser.add_argument("--scenes", help="comma separated list of scenes to cycle")
    parser.add_argument("--status-interval", type=float, default=0.25)
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(message)s",
    )
    config = load_config(args.config)

    if args.list_ports:
        for port in list_ports():
            print(port)
        return 0

    port = args.port or config.get("serial_port")
    if not port:
        print("no serial port given (use --port or --list-ports)", file=sys.stderr)
        return 2

    obs_host = args.obs_host or config.get("obs_host", "127.0.0.1")
    obs_port = args.obs_port or config.get("obs_port", 4455)
    scenes = config.get("scenes") or []
    if args.scenes:
        scenes = [s.strip() for s in args.scenes.split(",") if s.strip()]
    password = os.environ.get(args.obs_password_env)

    while True:
        serial = None
        obs = None
        try:
            serial = open_serial(port, args.baud)
            LOG.info("device connected on %s", port)
            obs = ObsClient(obs_host, obs_port, password=password, logger=LOG)
            obs.connect()
        except (SerialError, ObsError) as exc:
            LOG.error("%s", exc)
            if serial is not None:
                serial.close()
            time.sleep(2.0)
            continue

        bridge = Bridge(serial, obs, scenes=scenes, status_interval=args.status_interval)
        try:
            bridge.run()
        except KeyboardInterrupt:
            LOG.info("stopping")
            bridge.stop()
            if obs is not None:
                obs.close()
            return 0
        LOG.info("device link closed - reconnecting")
        if obs is not None:
            obs.close()
        time.sleep(1.0)


if __name__ == "__main__":
    sys.exit(main())
