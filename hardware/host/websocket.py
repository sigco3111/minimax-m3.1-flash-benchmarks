"""Minimal RFC 6455 WebSocket client (standard library only).

Written for the REC-1 host bridge so that the tool has *zero* third party
dependencies.  Only what obs-websocket needs is implemented:

  * client side handshake (HTTP/1.1 Upgrade, Sec-WebSocket-Accept check)
  * masked client -> server text frames
  * server -> client text frames (incl. 16/64 bit lengths and fragmentation)
  * ping/pong and close handling
"""

import base64
import hashlib
import os
import socket
import struct
import threading
import time

_WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OP_CONT = 0x0
OP_TEXT = 0x1
OP_BINARY = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA


class WebSocketError(Exception):
    """Connection/protocol level failure."""


class WebSocket:
    def __init__(self, host="127.0.0.1", port=4455, path="/", timeout=5.0):
        self.host = host
        self.port = port
        self.path = path
        self.timeout = timeout
        self._sock = None
        self._rx = bytearray()
        self._send_lock = threading.Lock()
        self._closed = False

    # ------------------------------------------------------------- connect --
    def connect(self):
        self._sock = socket.create_connection((self.host, self.port), self.timeout)
        self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n" % (self.path, self.host, self.port, key)
        )
        self._sock.sendall(request.encode("ascii"))

        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self._sock.recv(4096)
            if not chunk:
                raise WebSocketError("connection closed during handshake")
            buf += chunk
        head, _, rest = buf.partition(b"\r\n\r\n")
        self._rx = bytearray(rest)

        status = head.split(b"\r\n", 1)[0].decode("ascii", "replace")
        if " 101" not in status:
            raise WebSocketError("handshake failed: %s" % status)

        accept = None
        for line in head.split(b"\r\n")[1:]:
            if b":" in line:
                name, value = line.split(b":", 1)
                if name.strip().lower() == b"sec-websocket-accept":
                    accept = value.strip().decode("ascii")
        expected = base64.b64encode(
            hashlib.sha1(key.encode("ascii") + _WS_GUID).digest()
        ).decode("ascii")
        if accept != expected:
            raise WebSocketError("bad Sec-WebSocket-Accept")
        return self

    # --------------------------------------------------------------- frames --
    def _recv_exact(self, count, deadline):
        while len(self._rx) < count:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("websocket read timeout")
            self._sock.settimeout(remaining)
            chunk = self._sock.recv(65536)
            if not chunk:
                raise WebSocketError("connection closed by peer")
            self._rx += chunk
        data = bytes(self._rx[:count])
        del self._rx[:count]
        return data

    def _read_frame(self, deadline):
        head = self._recv_exact(2, deadline)
        fin = bool(head[0] & 0x80)
        opcode = head[0] & 0x0F
        masked = bool(head[1] & 0x80)
        length = head[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._recv_exact(2, deadline))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._recv_exact(8, deadline))[0]
        mask = self._recv_exact(4, deadline) if masked else None
        payload = self._recv_exact(length, deadline) if length else b""
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return fin, opcode, payload

    def _send_frame(self, opcode, payload=b""):
        if self._closed or self._sock is None:
            raise WebSocketError("socket is closed")
        header = bytearray()
        header.append(0x80 | opcode)
        mask = os.urandom(4)
        size = len(payload)
        if size < 126:
            header.append(0x80 | size)
        elif size < 65536:
            header.append(0x80 | 126)
            header += struct.pack("!H", size)
        else:
            header.append(0x80 | 127)
            header += struct.pack("!Q", size)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        with self._send_lock:
            self._sock.sendall(bytes(header) + masked)

    # ----------------------------------------------------------------- api --
    def send_text(self, text):
        self._send_frame(OP_TEXT, text.encode("utf-8"))

    def recv(self, timeout=5.0):
        """Returns the next complete text message (str).

        Raises TimeoutError when nothing arrives in time, WebSocketError when
        the peer closed the connection.
        """
        deadline = time.monotonic() + timeout
        buffer = bytearray()
        message_opcode = None
        while True:
            fin, opcode, payload = self._read_frame(deadline)
            if opcode == OP_CLOSE:
                raise WebSocketError("closed by peer")
            if opcode == OP_PING:
                self._send_frame(OP_PONG, payload)
                continue
            if opcode == OP_PONG:
                continue
            if opcode in (OP_TEXT, OP_BINARY):
                buffer = bytearray(payload)
                message_opcode = opcode
            elif opcode == OP_CONT:
                buffer += payload
            else:
                continue
            if fin:
                if message_opcode == OP_BINARY:
                    raise WebSocketError("binary frames are not supported")
                return bytes(buffer).decode("utf-8", "replace")

    def close(self):
        self._closed = True
        try:
            if self._sock is not None:
                self._send_frame(OP_CLOSE, b"")
        except Exception:
            pass
        try:
            if self._sock is not None:
                self._sock.shutdown(socket.SHUT_RDWR)
        except Exception:
            pass
        try:
            if self._sock is not None:
                self._sock.close()
        except Exception:
            pass
        self._sock = None
