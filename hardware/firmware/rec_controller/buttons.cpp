#include "buttons.h"

#include "config.h"

namespace rec {
namespace {
uint32_t g_seq = 0;
}

uint32_t NextSeq() {
  ++g_seq;
  /* 0 is reserved for "no sequence" on the wire. */
  if (g_seq == 0) ++g_seq;
  return g_seq;
}

void DebouncedButton::Begin(bool rawPressed, uint32_t nowMs) {
  stable_ = rawPressed;
  candidate_ = rawPressed;
  candidateSince_ = nowMs;
  pressEdge_ = false;
  releaseEdge_ = false;
}

void DebouncedButton::Update(bool rawPressed, uint32_t nowMs) {
  if (rawPressed != candidate_) {
    candidate_ = rawPressed;
    candidateSince_ = nowMs;
    return;
  }
  if (candidate_ == stable_) return;
  if (nowMs - candidateSince_ < BTN_DEBOUNCE_MS) return;

  stable_ = candidate_;
  if (stable_) {
    pressEdge_ = true;
  } else {
    releaseEdge_ = true;
  }
}

bool DebouncedButton::PollPress(uint32_t* outSeq) {
  if (!pressEdge_) return false;
  pressEdge_ = false;
  if (outSeq != nullptr) *outSeq = NextSeq();
  return true;
}

bool DebouncedButton::PollRelease() {
  if (!releaseEdge_) return false;
  releaseEdge_ = false;
  return true;
}

}  // namespace rec
