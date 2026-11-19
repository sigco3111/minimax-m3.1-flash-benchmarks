#pragma once
/*
 * Button debouncing + command sequencing (portable, no Arduino dependency).
 *
 * Requirements handled here:
 *  - mechanical switch bounce is filtered with a time based debounce
 *  - exactly one command is produced per physical press (no auto-repeat)
 *  - every command carries a monotonically increasing sequence number so the
 *    host can drop duplicated commands.
 */

#include <stdint.h>

namespace rec {

/* Global command sequence counter (device owned). */
uint32_t NextSeq();

/* One momentary button. */
class DebouncedButton {
 public:
  /* Seeds the state machine; call once before the first update(). */
  void Begin(bool rawPressed, uint32_t nowMs);

  /* Feeds the current raw (active-low) pin state. */
  void Update(bool rawPressed, uint32_t nowMs);

  /* Returns true once per press edge. outSeq receives the command sequence. */
  bool PollPress(uint32_t* outSeq);

  /* Returns true once per release edge. */
  bool PollRelease();

 private:
  bool stable_ = false;
  bool candidate_ = false;
  uint32_t candidateSince_ = 0;
  bool pressEdge_ = false;
  bool releaseEdge_ = false;
};

}  // namespace rec
