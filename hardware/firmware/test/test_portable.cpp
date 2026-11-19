/*
 * Host side unit test for the portable part of the REC-1 firmware
 * (protocol + button debouncing).  Compiled with the system C++ compiler:
 *
 *     make -C firmware/test
 */
#include <cstdio>
#include <cstring>
#include <string>

#include "buttons.h"
#include "protocol.h"

namespace {

int g_failures = 0;

void Check(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL: %s\n", what);
    ++g_failures;
  }
}

void CheckEq(const std::string& got, const std::string& want, const char* what) {
  if (got != want) {
    std::printf("FAIL: %s (got '%s', want '%s')\n", what, got.c_str(), want.c_str());
    ++g_failures;
  }
}

void TestProtocolRoundTrip() {
  char buf[rec::PROTO_MAX_LINE];
  size_t n = rec::FormatCommand(buf, sizeof(buf), "REC", "TOGGLE", 42);
  Check(n > 0, "FormatCommand returns a length");
  CheckEq(std::string(buf), "CMD REC TOGGLE 42", "command serialisation");

  rec::Message msg;
  Check(rec::ParseLine("CMD REC TOGGLE 42", &msg), "command parses");
  Check(msg.kind == rec::MsgKind::kCommand, "command kind");
  CheckEq(std::string(msg.name), "REC", "command name");
  CheckEq(std::string(msg.arg), "TOGGLE", "command arg");
  Check(msg.seq == 42, "command sequence");

  Check(rec::ParseLine("ST REC 1", &msg), "status parses");
  Check(msg.kind == rec::MsgKind::kStatus, "status kind");
  Check(msg.status == rec::StatusId::kRec, "status id");
  Check(msg.flag == true, "status flag");

  Check(rec::ParseLine("ST TIME 12.5", &msg), "time parses");
  Check(msg.status == rec::StatusId::kTime, "time id");
  Check(msg.seconds > 12.4f && msg.seconds < 12.6f, "time value");

  Check(rec::ParseLine("ST SCENE Intro Cut", &msg), "scene parses");
  CheckEq(std::string(msg.text), "Intro Cut", "scene name keeps spaces");

  Check(rec::ParseLine("PING 7", &msg), "ping parses");
  Check(msg.seq == 7, "ping sequence");

  Check(!rec::ParseLine("", &msg), "empty line rejected");
  Check(!rec::ParseLine("CMD REC ERASE 1", &msg), "unknown command rejected");
  Check(!rec::ParseLine("ST REC maybe", &msg), "non numeric flag rejected");
}

void TestDebounce() {
  rec::DebouncedButton button;
  button.Begin(false, 0);

  uint32_t seq = 0;

  /* Bouncing contact: must not produce a press. */
  for (uint32_t t = 0; t < 40; ++t) {
    button.Update((t % 2) == 0, t);
    Check(!button.PollPress(&seq), "bounce must not trigger a press");
  }

  /* Stable press for longer than the debounce window. */
  button.Update(true, 41);
  button.Update(true, 50);
  Check(!button.PollPress(&seq), "press is delayed until stable");
  button.Update(true, 70);
  Check(button.PollPress(&seq), "stable press triggers once");
  Check(!button.PollPress(&seq), "press edge is consumed");

  /* Holding the button must not repeat. */
  for (uint32_t t = 80; t < 200; ++t) {
    button.Update(true, t);
    Check(!button.PollPress(&seq), "held button must not repeat");
  }

  /* Release. */
  button.Update(false, 201);
  button.Update(false, 230);
  Check(button.PollRelease(), "release edge detected");

  /* Second press gets a new sequence number. */
  button.Update(true, 240);
  button.Update(true, 270);
  uint32_t first = seq;
  Check(button.PollPress(&seq), "second press triggers");
  Check(seq > first, "sequence numbers increase");
}

}  // namespace

int main() {
  TestProtocolRoundTrip();
  TestDebounce();
  if (g_failures == 0) {
    std::printf("all firmware portable tests passed\n");
    return 0;
  }
  std::printf("%d failure(s)\n", g_failures);
  return 1;
}
