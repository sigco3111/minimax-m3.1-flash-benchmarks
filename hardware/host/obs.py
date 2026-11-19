"""obs-websocket 5.x client for the REC-1 host bridge (standard library only).

Protocol reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

  op 0  Hello      (server -> client)
  op 1  Identify   (client -> server)
  op 2  Identified (server -> client)
  op 5  Event      (server -> client)
  op 6  Request    (client -> server)
  op 7  RequestResponse (server -> client)
"""

import json
import queue
import threading
import time
import uuid

from websocket import WebSocket, WebSocketError

OP_HELLO = 0
OP_IDENTIFY = 1
OP_IDENTIFIED = 2
OP_EVENT = 5
OP_REQUEST = 6
OP_REQUEST_RESPONSE = 7


class ObsError(Exception):
    pass


class ObsClient:
    """Thread safe obs-websocket client.

    `request()` blocks until the matching response arrives; events are queued
    and can be consumed with `events()`.
    """

    def __init__(self, host="127.0.0.1", port=4455, password=None, logger=None):
        self.host = host
        self.port = port
        self.password = password
        self.log = logger.info if logger else (lambda *a, **k: None)
        self._ws = None
        self._pending = {}
        self._events = queue.Queue()
        self._reader = None
        self._running = False
        self._lock = threading.Lock()
        self.version = None
        self.rpc_version = None

    # ------------------------------------------------------------ connect --
    def connect(self):
        ws = WebSocket(self.host, self.port, timeout=5.0)
        ws.connect()
        hello_raw = ws.recv(timeout=5.0)
        hello = json.loads(hello_raw)
        if hello.get("op") != OP_HELLO:
            raise ObsError("expected Hello, got op=%s" % hello.get("op"))
        data = hello.get("d", {})
        self.version = data.get("obsWebSocketVersion")
        self.rpc_version = data.get("rpcVersion", 1)
        auth = data.get("authentication") or {}
        challenge = auth.get("challenge")
        salt = auth.get("salt")
        if auth.get("authRequired"):
            if not self.password:
                raise ObsError("obs-websocket requires a password")
            import base64
            import hashlib

            secret = base64.b64encode(
                hashlib.sha256((self.password + salt).encode("utf-8")).digest()
            ).decode("ascii")
            secret = base64.b64encode(
                hashlib.sha256((secret + challenge).encode("utf-8")).digest()
            ).decode("ascii")
            auth_payload = {"challenge": challenge, "salt": salt, "response": secret}
        else:
            auth_payload = None
        identify = {"op": OP_IDENTIFY, "d": {"rpcVersion": self.rpc_version}}
        if auth_payload:
            identify["d"]["authentication"] = auth_payload
        ws.send_text(json.dumps(identify))
        reply = json.loads(ws.recv(timeout=5.0))
        if reply.get("op") != OP_IDENTIFIED:
            raise ObsError("identify rejected: %s" % reply)
        self._ws = ws
        self._running = True
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        self.log("obs-websocket %s connected", self.version)
        return self

    def _read_loop(self):
        while self._running:
            try:
                raw = self._ws.recv(timeout=1.0)
            except TimeoutError:
                continue
            except (WebSocketError, OSError) as exc:
                if self._running:
                    self.log("obs-websocket connection lost: %s", exc)
                self._running = False
                break
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            op = msg.get("op")
            data = msg.get("d", {})
            if op == OP_EVENT:
                self._events.put(data)
            elif op == OP_REQUEST_RESPONSE:
                request_id = data.get("requestId")
                with self._lock:
                    waiter = self._pending.pop(request_id, None)
                if waiter is not None:
                    waiter.append(data)

    # ----------------------------------------------------------- requests --
    def request(self, request_type, request_data=None, timeout=5.0):
        if self._ws is None or not self._running:
            raise ObsError("not connected")
        request_id = uuid.uuid4().hex
        payload = {"op": OP_REQUEST, "d": {"requestType": request_type,
                                          "requestId": request_id}}
        if request_data:
            payload["d"]["requestData"] = request_data
        waiter = []
        with self._lock:
            self._pending[request_id] = waiter
        self._ws.send_text(json.dumps(payload))
        deadline = time.monotonic() + timeout
        while not waiter:
            if time.monotonic() > deadline:
                with self._lock:
                    self._pending.pop(request_id, None)
                raise ObsError("timeout waiting for %s" % request_type)
            time.sleep(0.005)
        reply = waiter[0]
        status = reply.get("requestStatus", {})
        if not status.get("result", False):
            raise ObsError(
                "%s failed: %s" % (request_type, status.get("comment", status))
            )
        return reply.get("responseData", {})

    def events(self, timeout=0.2):
        try:
            return self._events.get(timeout=timeout)
        except queue.Empty:
            return None

    # -------------------------------------------------------------- misc --
    def connected(self):
        return self._running and self._ws is not None

    def close(self):
        self._running = False
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass
        self._ws = None
