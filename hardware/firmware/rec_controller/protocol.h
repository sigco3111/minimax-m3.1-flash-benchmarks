#pragma once
/*
 * REC-1 device <-> host line protocol (portable, no Arduino dependency).
 *
 * Framing   : ASCII, one message per line, '\n' terminated, max 63 bytes.
 * Encoding  : space separated tokens, no quoting, no escaping.
 *
 * device -> host
 *   HELLO <proto> <fw>                       boot / re-sync announcement
 *   CMD  <name> <arg> <seq>                  REC TOGGLE / SCENE NEXT
 *   PING <seq>                               liveness probe
 *   LOG  <free text>                         diagnostics
 *
 * host -> device
 *   PONG <seq>                               answer to PING
 *   ST   LINK <0|1>                          USB/serial link to the host is alive
 *   ST   OBS  <0|1>                          obs-websocket is connected
 *   ST   REC  <0|1>                          OBS *actual* record state
 *   ST   TIME <seconds>                      OBS reported recording duration
 *   ST   SCENE <name>                        current OBS program scene
 *   ACK  <name> <seq> <OK|ERR|DUP>           command acknowledgement
 *
 * `seq` is a monotonically increasing counter owned by the device. The host
 * uses it to drop duplicated commands (a replayed line must never toggle the
 * recorder twice).
 */

#include <stddef.h>
#include <stdint.h>

namespace rec {

static const uint8_t PROTO_VERSION = 1;
static const size_t  PROTO_MAX_LINE = 64;

enum class MsgKind : uint8_t {
  kNone = 0,
  kHello,
  kCommand,
  kPing,
  kPong,
  kStatus,
  kAck,
  kLog,
};

enum class StatusId : uint8_t {
  kNone = 0,
  kLink,
  kObs,
  kRec,
  kTime,
  kScene,
};

enum class AckResult : uint8_t {
  kNone = 0,
  kOk,
  kErr,
  kDup,
};

struct Message {
  MsgKind  kind = MsgKind::kNone;
  char     name[8] = {0};   /* "REC" / "SCENE"                      */
  char     arg[8] = {0};    /* "TOGGLE" / "NEXT"                    */
  uint32_t seq = 0;
  StatusId status = StatusId::kNone;
  bool     flag = false;    /* ST LINK/OBS/REC value                 */
  float    seconds = 0.0f;  /* ST TIME value                         */
  char     text[32] = {0};  /* ST SCENE name / LOG text              */
  AckResult ack = AckResult::kNone;
};

/* Serialises "CMD <name> <arg> <seq>". Returns the length written (0 on error). */
size_t FormatCommand(char* out, size_t cap, const char* name, const char* arg,
                      uint32_t seq);

/* Serialises "HELLO <proto> <fw>" / "PING <seq>" / "LOG <text>". */
size_t FormatHello(char* out, size_t cap, const char* fw);
size_t FormatPing(char* out, size_t cap, uint32_t seq);
size_t FormatLog(char* out, size_t cap, const char* text);

/* Parses one line (without the trailing newline). Returns true when the line
 * was understood. Unknown-but-well-formed lines are ignored (false). */
bool ParseLine(const char* line, Message* out);

}  // namespace rec
