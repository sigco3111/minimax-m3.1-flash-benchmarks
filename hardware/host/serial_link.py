"""Serial port access for the REC-1 host bridge.

POSIX (macOS / Linux): pure standard library implementation on top of
``termios`` - no third party package needed.
Windows: falls back to ``pyserial`` if it is installed (``pip install
pyserial``); without it the bridge reports a clear error.
"""

import glob
import os
import sys

try:  # pragma: no cover - Windows only
    import serial as _pyserial
except ImportError:  # pragma: no cover
    _pyserial = None


class SerialError(Exception):
    pass


def list_ports():
    """Returns the serial devices that could be a REC-1 controller."""
    if sys.platform.startswith("win"):
        try:
            import serial.tools.list_ports as lp
            return [p.device for p in lp.comports()]
        except Exception:
            return []
    patterns = (
        "/dev/tty.usbmodem*",
        "/dev/tty.usbserial*",
        "/dev/tty.SLAB*",
        "/dev/cu.usbmodem*",
        "/dev/cu.usbserial*",
        "/dev/ttyACM*",
        "/dev/ttyUSB*",
    )
    found = []
    for pattern in patterns:
        found.extend(sorted(glob.glob(pattern)))
    return found


class PosixSerial:
    """termios based serial port (macOS / Linux)."""

    def __init__(self, port, baud=115200):
        self.port = port
        self.baud = baud
        self._fd = None

    @property
    def connected(self):
        return self._fd is not None

    def open(self):
        import termios

        try:
            self._fd = os.open(self.port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        except OSError as exc:
            raise SerialError("cannot open %s: %s" % (self.port, exc))

        iflag, oflag, cflag, lflag, ispeed, ospeed, cc = termios.tcgetattr(self._fd)
        iflag &= ~(
            termios.IGNBRK
            | termios.BRKINT
            | termios.PARMRK
            | termios.ISTRIP
            | termios.INLCR
            | termios.IGNCR
            | termios.ICRNL
            | termios.IXON
            | termios.IXOFF
        )
        oflag &= ~termios.OPOST
        lflag &= ~(
            termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN
        )
        cflag &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB)
        cflag |= termios.CS8 | termios.CLOCAL | termios.CREAD

        speed = getattr(termios, "B%d" % self.baud, None)
        if speed is None:
            self.close()
            raise SerialError("unsupported baud rate %d" % self.baud)
        attrs = [iflag, oflag, cflag, lflag, speed, speed, cc]
        cc[termios.VMIN] = 0
        cc[termios.VTIME] = 0
        termios.tcsetattr(self._fd, termios.TCSANOW, attrs)
        termios.tcflush(self._fd, termios.TCIFLUSH)
        return self

    def read(self, max_bytes=4096):
        if self._fd is None:
            raise SerialError("port is not open")
        try:
            return os.read(self._fd, max_bytes)
        except BlockingIOError:
            return b""
        except OSError as exc:
            raise SerialError("read failed: %s" % exc)

    def write(self, data):
        if self._fd is None:
            raise SerialError("port is not open")
        total = 0
        while total < len(data):
            try:
                total += os.write(self._fd, data[total:])
            except BlockingIOError:
                time.sleep(0.001)
            except OSError as exc:
                raise SerialError("write failed: %s" % exc)
        return total

    def close(self):
        if self._fd is not None:
            try:
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None


class PySerial:
    """pyserial wrapper (Windows / optional on POSIX)."""

    def __init__(self, port, baud=115200):
        self.port = port
        self.baud = baud
        self._ser = None

    @property
    def connected(self):
        return self._ser is not None and self._ser.is_open

    def open(self):
        if _pyserial is None:
            raise SerialError("pyserial is not installed (pip install pyserial)")
        try:
            self._ser = _pyserial.Serial(self.port, self.baud, timeout=0.05)
        except Exception as exc:
            raise SerialError("cannot open %s: %s" % (self.port, exc))
        return self

    def read(self, max_bytes=4096):
        if self._ser is None:
            raise SerialError("port is not open")
        try:
            return self._ser.read(max_bytes)
        except Exception as exc:
            raise SerialError("read failed: %s" % exc)

    def write(self, data):
        if self._ser is None:
            raise SerialError("port is not open")
        try:
            return self._ser.write(data)
        except Exception as exc:
            raise SerialError("write failed: %s" % exc)

    def close(self):
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
            self._ser = None


def open_serial(port, baud=115200):
    """Opens a serial port using the best implementation available."""
    if sys.platform.startswith("win") or _pyserial is not None:
        try:
            return PySerial(port, baud).open()
        except SerialError:
            if sys.platform.startswith("win"):
                raise
    return PosixSerial(port, baud).open()


import time  # noqa: E402  (kept at the bottom to keep the import list tidy)
