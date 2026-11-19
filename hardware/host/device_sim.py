"""Simulated REC-1 device - used by the automated tests.

`FakeSerial` replaces the USB CDC port with an in-memory pipe and
`SimulatedDevice` produces the very same protocol the firmware produces.
"""

import threading
import time


class FakeSerial:
    """In-memory serial port."""

    def __init__(self):
        self._rx = bytearray()
        self._tx = bytearray()
        self._connected = True
        self._lock = threading.Lock()

    @property
    def connected(self):
        return self._connected

    # device -> host
    def feed(self, text):
        with self._lock:
            self._rx += text.encode("utf-8")

    # host -> device
    def take_tx(self):
        with self._lock:
            data = bytes(self._tx)
            self._tx = bytearray()
        return data

    def read(self, timeout=0.05):
        with self._lock:
            if not self._rx:
                data = b""
            else:
                data = bytes(self._rx)
                self._rx = bytearray()
        if not data:
            time.sleep(timeout)
        return data

    def write(self, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        with self._lock:
            self._tx += data
        return len(data)

    def close(self):
        self._connected = False


class SimulatedDevice:
    """Emulates the firmware side of the protocol."""

    def __init__(self, serial, hello_interval=0.5, ping_interval=0.5):
        self.serial = serial
        self.hello_interval = hello_interval
        self.ping_interval = ping_interval
        self._seq = 0
        self._running = False
        self._thread = None
        self._lock = threading.Lock()

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def stop(self):
        self._running = False

    def _loop(self):
        last_hello = 0.0
        last_ping = 0.0
        while self._running:
            now = time.monotonic()
            if now - last_hello >= self.hello_interval:
                last_hello = now
                self.serial.feed("HELLO 1 1.0.0\n")
            if now - last_ping >= self.ping_interval:
                last_ping = now
                self._seq += 1
                self.serial.feed("PING %d\n" % self._seq)
            time.sleep(0.05)

    def press_record(self):
        with self._lock:
            self._seq += 1
            seq = self._seq
        self.serial.feed("CMD REC TOGGLE %d\n" % seq)
        return seq

    def press_scene(self):
        with self._lock:
            self._seq += 1
            seq = self._seq
        self.serial.feed("CMD SCENE NEXT %d\n" % seq)
        return seq

    def replay_last(self, line):
        """Feeds a line again - used to test duplicate suppression."""
        self.serial.feed(line)
