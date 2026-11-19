#include "protocol.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace rec {
namespace {

const char kSpace[] = " ";

size_t CopyBounded(char* dst, size_t cap, const char* src) {
  size_t n = 0;
  if (cap == 0) return 0;
  while (src[n] != '\0' && n + 1 < cap) {
    dst[n] = src[n];
    ++n;
  }
  dst[n] = '\0';
  return n;
}

/* Splits `line` in place into at most `max` tokens. */
size_t Tokenize(char* line, char** tokens, size_t max) {
  size_t count = 0;
  char* p = line;
  while (*p != '\0' && count < max) {
    while (*p == ' ' || *p == '\t' || *p == '\r') ++p;
    if (*p == '\0') break;
    tokens[count++] = p;
    while (*p != '\0' && *p != ' ' && *p != '\t' && *p != '\r') ++p;
    if (*p != '\0') *p++ = '\0';
  }
  return count;
}

bool IsDigits(const char* s) {
  if (s == nullptr || *s == '\0') return false;
  for (; *s != '\0'; ++s) {
    if (*s < '0' || *s > '9') return false;
  }
  return true;
}

/* Only the commands the firmware actually emits are accepted. */
bool IsKnownCommand(const char* name, const char* arg) {
  return (strcmp(name, "REC") == 0 && strcmp(arg, "TOGGLE") == 0) ||
         (strcmp(name, "SCENE") == 0 && strcmp(arg, "NEXT") == 0);
}

/* Strict boolean: only "0" and "1" are valid. */
bool ParseFlag(const char* s, bool* out) {
  if (s == nullptr) return false;
  if (strcmp(s, "0") == 0) {
    *out = false;
    return true;
  }
  if (strcmp(s, "1") == 0) {
    *out = true;
    return true;
  }
  return false;
}

bool ParseUint(const char* s, uint32_t* out) {
  if (!IsDigits(s)) return false;
  *out = static_cast<uint32_t>(strtoul(s, nullptr, 10));
  return true;
}

bool ParseFloat(const char* s, float* out) {
  if (s == nullptr || *s == '\0') return false;
  char* end = nullptr;
  float v = strtof(s, &end);
  if (end == s || (end != nullptr && *end != '\0')) return false;
  *out = v;
  return true;
}

}  // namespace

size_t FormatCommand(char* out, size_t cap, const char* name, const char* arg,
                      uint32_t seq) {
  if (out == nullptr || cap == 0 || name == nullptr || arg == nullptr) return 0;
  int n = snprintf(out, cap, "CMD %s %s %lu", name, arg,
                   static_cast<unsigned long>(seq));
  if (n < 0 || static_cast<size_t>(n) >= cap) return 0;
  return static_cast<size_t>(n);
}

size_t FormatHello(char* out, size_t cap, const char* fw) {
  if (out == nullptr || cap == 0) return 0;
  int n = snprintf(out, cap, "HELLO %u %s", (unsigned)PROTO_VERSION,
                   fw != nullptr ? fw : "0");
  if (n < 0 || static_cast<size_t>(n) >= cap) return 0;
  return static_cast<size_t>(n);
}

size_t FormatPing(char* out, size_t cap, uint32_t seq) {
  if (out == nullptr || cap == 0) return 0;
  int n = snprintf(out, cap, "PING %lu", static_cast<unsigned long>(seq));
  if (n < 0 || static_cast<size_t>(n) >= cap) return 0;
  return static_cast<size_t>(n);
}

size_t FormatLog(char* out, size_t cap, const char* text) {
  if (out == nullptr || cap == 0) return 0;
  int n = snprintf(out, cap, "LOG %s", text != nullptr ? text : "");
  if (n < 0 || static_cast<size_t>(n) >= cap) return 0;
  return static_cast<size_t>(n);
}

bool ParseLine(const char* line, Message* out) {
  if (line == nullptr || out == nullptr) return false;

  char buf[PROTO_MAX_LINE];
  size_t len = strlen(line);
  if (len == 0 || len >= sizeof(buf)) return false;
  memcpy(buf, line, len + 1);

  char* tok[6];
  size_t count = Tokenize(buf, tok, 6);
  if (count == 0) return false;

  *out = Message();

  if (strcmp(tok[0], "HELLO") == 0) {
    if (count < 2) return false;
    out->kind = MsgKind::kHello;
    out->seq = 0;
    if (count >= 3) CopyBounded(out->text, sizeof(out->text), tok[2]);
    return true;
  }

  if (strcmp(tok[0], "CMD") == 0) {
    if (count < 4) return false;
    uint32_t seq = 0;
    if (!ParseUint(tok[3], &seq)) return false;
    if (!IsKnownCommand(tok[1], tok[2])) return false;
    out->kind = MsgKind::kCommand;
    CopyBounded(out->name, sizeof(out->name), tok[1]);
    CopyBounded(out->arg, sizeof(out->arg), tok[2]);
    out->seq = seq;
    return true;
  }

  if (strcmp(tok[0], "PING") == 0) {
    if (count < 2) return false;
    uint32_t seq = 0;
    if (!ParseUint(tok[1], &seq)) return false;
    out->kind = MsgKind::kPing;
    out->seq = seq;
    return true;
  }

  if (strcmp(tok[0], "PONG") == 0) {
    if (count < 2) return false;
    uint32_t seq = 0;
    if (!ParseUint(tok[1], &seq)) return false;
    out->kind = MsgKind::kPong;
    out->seq = seq;
    return true;
  }

  if (strcmp(tok[0], "ST") == 0) {
    if (count < 3) return false;
    out->kind = MsgKind::kStatus;
    if (strcmp(tok[1], "LINK") == 0) {
      out->status = StatusId::kLink;
      if (!ParseFlag(tok[2], &out->flag)) return false;
      return true;
    }
    if (strcmp(tok[1], "OBS") == 0) {
      out->status = StatusId::kObs;
      if (!ParseFlag(tok[2], &out->flag)) return false;
      return true;
    }
    if (strcmp(tok[1], "REC") == 0) {
      out->status = StatusId::kRec;
      if (!ParseFlag(tok[2], &out->flag)) return false;
      return true;
    }
    if (strcmp(tok[1], "TIME") == 0) {
      out->status = StatusId::kTime;
      if (!ParseFloat(tok[2], &out->seconds)) return false;
      return true;
    }
    if (strcmp(tok[1], "SCENE") == 0) {
      out->status = StatusId::kScene;
      /* Scene names may contain spaces: keep the remainder of the line. */
      size_t used = 0;
      for (size_t i = 2; i < count; ++i) {
        int w = snprintf(out->text + used, sizeof(out->text) - used, "%s%s",
                         used > 0 ? " " : "", tok[i]);
        if (w < 0 || static_cast<size_t>(w) >= sizeof(out->text) - used) break;
        used += static_cast<size_t>(w);
      }
      return true;
    }
    return false;
  }

  if (strcmp(tok[0], "ACK") == 0) {
    if (count < 4) return false;
    uint32_t seq = 0;
    if (!ParseUint(tok[2], &seq)) return false;
    out->kind = MsgKind::kAck;
    CopyBounded(out->name, sizeof(out->name), tok[1]);
    out->seq = seq;
    if (strcmp(tok[3], "OK") == 0) {
      out->ack = AckResult::kOk;
    } else if (strcmp(tok[3], "ERR") == 0) {
      out->ack = AckResult::kErr;
    } else if (strcmp(tok[3], "DUP") == 0) {
      out->ack = AckResult::kDup;
    } else {
      return false;
    }
    return true;
  }

  if (strcmp(tok[0], "LOG") == 0) {
    out->kind = MsgKind::kLog;
    size_t used = 0;
    for (size_t i = 1; i < count; ++i) {
      int w = snprintf(out->text + used, sizeof(out->text) - used, "%s%s",
                       used > 0 ? " " : "", tok[i]);
      if (w < 0 || static_cast<size_t>(w) >= sizeof(out->text) - used) break;
      used += static_cast<size_t>(w);
    }
    return true;
  }

  (void)kSpace;
  return false;
}

}  // namespace rec
