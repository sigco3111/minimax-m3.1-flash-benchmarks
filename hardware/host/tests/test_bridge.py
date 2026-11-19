#!/usr/bin/env python3
"""Automated tests for the REC-1 host bridge.

Run with:  python3 -m unittest discover -s host/tests -v
"""

import os
import sys
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
HOST = os.path.dirname(HERE)
sys.path.insert(0, HOST)

import bridge  # noqa: E402
import device_protocol  # noqa: E402
import mock_obs  # noqa: E402
import obs  # noqa: E402
from device_sim import FakeSerial, SimulatedDevice  # noqa: E402


def wait_for(predicate, timeout=3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


class ProtocolTests(unittest.TestCase):
    def test_parse_command(self):
        msg = device_protocol.parse_line("CMD REC TOGGLE 7")
        self.assertEqual(msg["kind"], "cmd")
        self.assertEqual(msg["name"], "REC")
        self.assertEqual(msg["arg"], "TOGGLE")
        self.assertEqual(msg["seq"], 7)

    def test_parse_rejects_unknown_command(self):
        self.assertIsNone(device_protocol.parse_line("CMD REC ERASE 1"))
        self.assertIsNone(device_protocol.parse_line("garbage"))
        self.assertIsNone(device_protocol.parse_line(""))

    def test_parse_ping_and_hello(self):
        self.assertEqual(device_protocol.parse_line("PING 12")["seq"], 12)
        hello = device_protocol.parse_line("HELLO 1 1.0.0")
        self.assertEqual(hello["proto"], 1)

    def test_status_block(self):
        block = device_protocol.format_status(
            link=True, obs=True, recording=True, duration=12.5, scene="Intro"
        ).decode()
        self.assertIn("ST LINK 1", block)
        self.assertIn("ST OBS 1", block)
        self.assertIn("ST REC 1", block)
        self.assertIn("ST TIME 12.5", block)
        self.assertIn("ST SCENE Intro", block)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.server = mock_obs.MockObsServer(
            scenes=("Intro", "Gameplay", "Outro")
        ).start()
        self.obs = obs.ObsClient("127.0.0.1", self.server.port).connect()
        self.serial = FakeSerial()
        self.bridge = bridge.Bridge(
            self.serial, self.obs, scenes=["Intro", "Gameplay", "Outro"]
        )

    def tearDown(self):
        self.obs.close()
        self.server.stop()

    def test_record_toggle_reaches_obs(self):
        self.bridge.handle_line("CMD REC TOGGLE 1")
        types = [t for t, _ in self.server.requests]
        self.assertIn("ToggleRecord", types)
        self.assertTrue(self.server.recording)
        ack = self.serial.take_tx().decode()
        self.assertIn("ACK REC 1 OK", ack)

    def test_duplicate_command_is_dropped(self):
        self.bridge.handle_line("CMD REC TOGGLE 4")
        self.bridge.handle_line("CMD REC TOGGLE 4")
        toggles = [t for t, _ in self.server.requests if t == "ToggleRecord"]
        self.assertEqual(len(toggles), 1, "duplicate command must not toggle twice")
        self.assertIn("ACK REC 4 DUP", self.serial.take_tx().decode())

    def test_out_of_order_command_is_dropped(self):
        self.bridge.handle_line("CMD REC TOGGLE 9")
        self.bridge.handle_line("CMD REC TOGGLE 3")
        toggles = [t for t, _ in self.server.requests if t == "ToggleRecord"]
        self.assertEqual(len(toggles), 1)

    def test_hello_resets_the_dedupe_window(self):
        self.bridge.handle_line("CMD REC TOGGLE 10")
        self.bridge.handle_line("HELLO 1 1.0.0")  # device rebooted
        self.bridge.handle_line("CMD REC TOGGLE 1")
        toggles = [t for t, _ in self.server.requests if t == "ToggleRecord"]
        self.assertEqual(len(toggles), 2)

    def test_scene_cycles_in_order(self):
        self.bridge.handle_line("CMD SCENE NEXT 1")
        self.assertEqual(self.server.current_scene, "Gameplay")
        self.bridge.handle_line("CMD SCENE NEXT 2")
        self.assertEqual(self.server.current_scene, "Outro")
        self.bridge.handle_line("CMD SCENE NEXT 3")
        self.assertEqual(self.server.current_scene, "Intro")

    def test_ping_is_answered_and_status_is_pushed(self):
        self.bridge.handle_line("PING 42")
        tx = self.serial.take_tx().decode()
        self.assertIn("PONG 42", tx)
        self.assertIn("ST LINK 1", tx)
        self.assertIn("ST OBS 1", tx)

    def test_status_reflects_the_real_record_state(self):
        self.bridge.handle_line("CMD REC TOGGLE 1")
        self.bridge.push_status()
        tx = self.serial.take_tx().decode()
        self.assertIn("ST REC 1", tx)
        self.server.recording = False
        self.bridge.push_status()
        tx = self.serial.take_tx().decode()
        self.assertIn("ST REC 0", tx)


class EndToEndTests(unittest.TestCase):
    """Device simulator -> bridge -> mock OBS -> status back to the device."""

    def setUp(self):
        self.server = mock_obs.MockObsServer(
            scenes=("Intro", "Gameplay", "Outro")
        ).start()
        self.obs = obs.ObsClient("127.0.0.1", self.server.port).connect()
        self.serial = FakeSerial()
        self.device = SimulatedDevice(self.serial).start()
        self.bridge = bridge.Bridge(
            self.serial, self.obs, scenes=["Intro", "Gameplay", "Outro"]
        )
        self._runner = threading.Thread(target=self.bridge.run, daemon=True)
        self._runner.start()

    def tearDown(self):
        self.device.stop()
        self.bridge.stop()
        self.obs.close()
        self.server.stop()

    def test_button_press_records_and_the_device_is_told(self):
        self.device.press_record()
        self.assertTrue(
            wait_for(lambda: "ST REC 1" in self.serial.take_tx().decode()),
            "device never received the recording state",
        )

    def test_scene_button_switches_the_scene(self):
        self.device.press_scene()
        self.assertTrue(
            wait_for(lambda: self.server.current_scene == "Gameplay"),
            "scene did not change",
        )


class WebSocketTests(unittest.TestCase):
    def test_request_response_round_trip(self):
        server = mock_obs.MockObsServer().start()
        try:
            client = obs.ObsClient("127.0.0.1", server.port).connect()
            try:
                version = client.request("GetVersion")
                self.assertEqual(version["obsWebSocketVersion"], "5.5.2")
                status = client.request("GetRecordStatus")
                self.assertFalse(status["output_active"])
            finally:
                client.close()
        finally:
            server.stop()


if __name__ == "__main__":
    unittest.main()
