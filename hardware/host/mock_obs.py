"""Mock obs-websocket 5.x server - used by the automated tests.

Implements the subset of the protocol that REC-1 uses:

  Hello / Identify / Identified
  GetVersion, GetRecordStatus, ToggleRecord, GetSceneList,
  SetCurrentProgramScene
  RecordStateChanged and CurrentProgramSceneChanged events
"""

import base64
import hashlib
import json
import os
import socket
import struct
import threading
import time

_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OP_HELLO = 0
OP_IDENTIFY = 1
OP_IDENTIFIED = 2
OP_EVENT = 5
OP_REQUEST = 6
OP_REQUEST_RESPONSE = 7


class MockObsServer:
    def __init__(self, scenes=("Intro", "Gameplay", "Outro"), host="127.0.0.1",
                 port=0, password=None):
        self.scenes = list(scenes)
        self.host = host
        self.port = port
        self.password = password
        self.requests = []
        self.recording = False
        self.duration = 0.0
        self.current_scene = self.scenes[0] if self.scenes else ""
        self._sock = None
        self._thread = None
        self._running = False
        self._clients = []
        self._started_at = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------ server --
    def start(self):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.listen(4)
        self.port = self._sock.getsockname()[1]
        self._running = True
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()
        return self

    def stop(self):
        self._running = False
        try:
            if self._sock is not None:
                self._sock.close()
        except Exception:
            pass
        self._sock = None

    def _accept_loop(self):
        while self._running:
            try:
                conn, _ = self._sock.accept()
            except OSError:
                break
            thread = threading.Thread(target=self._client_loop, args=(conn,), daemon=True)
            thread.start()

    # ------------------------------------------------------------ frames --
    def _handshake(self, conn):
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = conn.recv(4096)
            if not chunk:
                return False
            buf += chunk
        head = buf.split(b"\r\n\r\n", 1)[0].decode("ascii", "replace")
        key = None
        for line in head.split("\r\n")[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                if name.strip().lower() == "sec-websocket-key":
                    key = value.strip()
        if key is None:
            return False
        accept = base64.b64encode(
            hashlib.sha1(key.encode("ascii") + _GUID).digest()
        ).decode("ascii")
        conn.sendall(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Accept: %s\r\n\r\n" % accept
            ).encode("ascii")
        )
        return True

    def _send_frame(self, conn, payload):
        data = payload.encode("utf-8")
        header = bytearray([0x81])
        size = len(data)
        if size < 126:
            header.append(size)
        elif size < 65536:
            header.append(126)
            header += struct.pack("!H", size)
        else:
            header.append(127)
            header += struct.pack("!Q", size)
        with self._lock:
            conn.sendall(bytes(header) + data)

    def _recv_frame(self, conn):
        def read_exact(count):
            buf = b""
            while len(buf) < count:
                chunk = conn.recv(count - len(buf))
                if not chunk:
                    return None
                buf += chunk
            return buf

        head = read_exact(2)
        if head is None:
            return None
        opcode = head[0] & 0x0F
        masked = bool(head[1] & 0x80)
        length = head[1] & 0x7F
        if length == 126:
            ext = read_exact(2)
            if ext is None:
                return None
            length = struct.unpack("!H", ext)[0]
        elif length == 127:
            ext = read_exact(8)
            if ext is None:
                return None
            length = struct.unpack("!Q", ext)[0]
        mask = read_exact(4) if masked else None
        payload = read_exact(length) if length else b""
        if payload is None:
            return None
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        return opcode, payload.decode("utf-8", "replace")

    # --------------------------------------------------------- protocol --
    def _client_loop(self, conn):
        try:
            if not self._handshake(conn):
                return
            self._clients.append(conn)
            hello = {
                "op": OP_HELLO,
                "d": {
                    "obsWebSocketVersion": "5.5.2",
                    "rpcVersion": 1,
                    "authentication": {},
                },
            }
            if self.password:
                hello["d"]["authentication"] = {
                    "challenge": base64.b64encode(os.urandom(16)).decode(),
                    "salt": base64.b64encode(os.urandom(16)).decode(),
                }
            self._send_frame(conn, json.dumps(hello))

            while self._running:
                frame = self._recv_frame(conn)
                if frame is None:
                    break
                opcode, raw = frame
                if opcode == 0x8:
                    break
                if opcode != 0x1:
                    continue
                msg = json.loads(raw)
                reply = self._handle_message(msg)
                if reply is not None:
                    self._send_frame(conn, json.dumps(reply))
        except (OSError, ValueError):
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass
            if conn in self._clients:
                self._clients.remove(conn)

    def _handle_message(self, msg):
        op = msg.get("op")
        if op == OP_IDENTIFY:
            return {"op": OP_IDENTIFIED, "d": {"negotiatedRpcVersion": 1}}
        if op != OP_REQUEST:
            return None
        data = msg.get("d", {})
        request_type = data.get("requestType")
        request_data = data.get("requestData", {}) or {}
        request_id = data.get("requestId", "")
        self.requests.append((request_type, request_data))

        response_data = {}
        ok = True
        code = 100
        comment = ""
        if request_type == "GetVersion":
            response_data = {
                "obsVersion": "30.0.0",
                "obsWebSocketVersion": "5.5.2",
                "rpcVersion": 1,
            }
        elif request_type == "GetRecordStatus":
            if self.recording and self._started_at is not None:
                self.duration = time.monotonic() - self._started_at
            response_data = {
                "output_active": self.recording,
                "output_duration": self.duration,
                "output_bytes": 0,
                "output_timecode": "00:00:00.000",
            }
        elif request_type == "ToggleRecord":
            self.recording = not self.recording
            if self.recording:
                self._started_at = time.monotonic()
                self.duration = 0.0
            else:
                self._started_at = None
            response_data = {"output_active": self.recording}
            self._emit("RecordStateChanged", {"output_active": self.recording})
        elif request_type == "GetSceneList":
            response_data = {
                "currentProgramSceneName": self.current_scene,
                "scenes": [
                    {"sceneName": name, "sceneIndex": index}
                    for index, name in enumerate(self.scenes)
                ],
            }
        elif request_type == "SetCurrentProgramScene":
            name = request_data.get("sceneName")
            if name in self.scenes:
                self.current_scene = name
                response_data = {"sceneName": name}
                self._emit("CurrentProgramSceneChanged", {"sceneName": name})
            else:
                ok = False
                code = 203
                comment = "scene not found"
        else:
            ok = False
            code = 204
            comment = "unknown request type"

        return {
            "op": OP_REQUEST_RESPONSE,
            "d": {
                "requestType": request_type,
                "requestId": request_id,
                "requestStatus": {"result": ok, "code": code, "comment": comment},
                "responseData": response_data,
            },
        }

    def _emit(self, event_type, event_data):
        payload = json.dumps(
            {"op": OP_EVENT, "d": {"eventType": event_type, "eventData": event_data}}
        )
        for conn in list(self._clients):
            try:
                self._send_frame(conn, payload)
            except Exception:
                pass
