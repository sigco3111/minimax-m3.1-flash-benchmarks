/*
 * REC-1 - desk recording controller firmware (Adafruit QT Py RP2040).
 *
 * The device is a thin, deterministic remote control:
 *   - physical buttons are debounced and turned into numbered commands
 *   - the host bridge (host/bridge.py) owns the OBS side and pushes back the
 *     *real* record state, so the red LED always mirrors OBS and never the
 *     button press
 *   - the OLED shows the timer, the link state and the current scene
 *
 * Protocol: firmware/rec_controller/protocol.h
 */

#include <Arduino.h>
#include <Wire.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "buttons.h"
#include "config.h"
#include "protocol.h"
#include "ui.h"

namespace {

const char kFwVersion[] = "1.0.0";

Adafruit_SSD1306 gDisplay(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire1, OLED_RESET_PIN, 0,
                           OLED_I2C_ADDR);
rec::Ui gUi;
rec::DebouncedButton gRecordButton;
rec::DebouncedButton gSceneButton;

char gLine[rec::PROTO_MAX_LINE];
size_t gLineLen = 0;
uint32_t gLastHostMsgMs = 0;
uint32_t gLastPingMs = 0;
uint32_t gLastHelloMs = 0;
bool gHostSeen = false;

void SendLine(const char* line, size_t len) {
  Serial.write(reinterpret_cast<const uint8_t*>(line), len);
  Serial.write('\n');
  Serial.flush();
}

void SendHello() {
  char buf[rec::PROTO_MAX_LINE];
  size_t n = rec::FormatHello(buf, sizeof(buf), kFwVersion);
  if (n > 0) SendLine(buf, n);
}

void SendPing() {
  char buf[rec::PROTO_MAX_LINE];
  uint32_t seq = rec::NextSeq();
  size_t n = rec::FormatPing(buf, sizeof(buf), seq);
  if (n > 0) SendLine(buf, n);
}

void SendCommand(const char* name, const char* arg, uint32_t seq) {
  char buf[rec::PROTO_MAX_LINE];
  size_t n = rec::FormatCommand(buf, sizeof(buf), name, arg, seq);
  if (n > 0) SendLine(buf, n);
}

void HandleHostLine(const char* line) {
  rec::Message msg;
  if (!rec::ParseLine(line, &msg)) return;

  gLastHostMsgMs = millis();
  gHostSeen = true;

  switch (msg.kind) {
    case rec::MsgKind::kPong:
      gUi.SetLinkUp(true);
      break;
    case rec::MsgKind::kStatus:
      gUi.ApplyStatus(msg);
      if (msg.status == rec::StatusId::kLink) gUi.SetLinkUp(msg.flag);
      break;
    case rec::MsgKind::kAck:
      if (msg.ack == rec::AckResult::kErr) {
        gUi.MarkCommandPending(0); /* drop the pending marker */
      }
      break;
    default:
      break;
  }
}

}  // namespace

void setup() {
  Serial.begin(LINK_BAUD);

  pinMode(BTN_RECORD_PIN, INPUT_PULLUP);
  pinMode(BTN_SCENE_PIN, INPUT_PULLUP);
  pinMode(LED_RECORD_PIN, OUTPUT);
  digitalWrite(LED_RECORD_PIN, LOW);

  /* The STEMMA QT connector of the QT Py is wired to I2C1 (SDA=22, SCL=23). */
  Wire1.begin();
  Wire1.setClock(400000);

  /* periphBegin=false: Wire1 is already initialised above (keep 400 kHz). */
  if (!gDisplay.begin(SSD1306_EXTERNALVCC, OLED_I2C_ADDR, true, false)) {
    gDisplay.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR, true, false);
  }
  gUi.Begin(&gDisplay);

  const uint32_t now = millis();
  gRecordButton.Begin(digitalRead(BTN_RECORD_PIN) == LOW, now);
  gSceneButton.Begin(digitalRead(BTN_SCENE_PIN) == LOW, now);

  SendHello();
  gLastHelloMs = now;
}

void loop() {
  const uint32_t now = millis();

  /* --- buttons ---------------------------------------------------------- */
  gRecordButton.Update(digitalRead(BTN_RECORD_PIN) == LOW, now);
  gSceneButton.Update(digitalRead(BTN_SCENE_PIN) == LOW, now);

  uint32_t seq = 0;
  if (gRecordButton.PollPress(&seq)) {
    SendCommand("REC", "TOGGLE", seq);
    gUi.MarkCommandPending(now);
  }
  if (gSceneButton.PollPress(&seq)) {
    SendCommand("SCENE", "NEXT", seq);
    gUi.MarkCommandPending(now);
  }

  /* --- host -> device --------------------------------------------------- */
  while (Serial.available() > 0) {
    const int c = Serial.read();
    if (c < 0) break;
    if (c == '\n') {
      gLine[gLineLen] = '\0';
      if (gLineLen > 0) HandleHostLine(gLine);
      gLineLen = 0;
    } else if (c != '\r' && gLineLen + 1 < sizeof(gLine)) {
      gLine[gLineLen++] = static_cast<char>(c);
    }
  }

  /* --- link watchdog ---------------------------------------------------- */
  if (now - gLastHostMsgMs > HOST_LINK_TIMEOUT_MS) {
    gUi.SetLinkUp(false);
  }

  /* --- keep alive -------------------------------------------------------- */
  if (now - gLastPingMs >= HOST_PING_MS) {
    gLastPingMs = now;
    SendPing();
    if (!gHostSeen && now - gLastHelloMs >= HOST_PING_MS) {
      gLastHelloMs = now;
      SendHello();
    }
  }

  /* --- indicator --------------------------------------------------------- */
  /* Solid on = OBS confirmed recording. Off = not recording (or unknown). */
  digitalWrite(LED_RECORD_PIN, gUi.RecordingConfirmed() ? HIGH : LOW);

  gUi.Update(now);
  delay(HOST_POLL_MS);
}
