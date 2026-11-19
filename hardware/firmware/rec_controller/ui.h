#pragma once
/*
 * Screen + indicator state handling for REC-1.
 *
 * The screen shows the recording timer, the link state and the current scene.
 * The red LED is driven from the *host confirmed* OBS record state only - it
 * never lights up just because a button was pressed.
 */

#include <Adafruit_SSD1306.h>
#include <stdint.h>

#include "protocol.h"

namespace rec {

class Ui {
 public:
  void Begin(Adafruit_SSD1306* display);

  /* Applies one host status message (ST ...). */
  void ApplyStatus(const Message& msg);

  void SetLinkUp(bool up);
  void MarkCommandPending(uint32_t nowMs);

  bool RecordingConfirmed() const { return rec_; }
  bool Pending(uint32_t nowMs) const { return nowMs < pendingUntil_; }
  bool LinkUp() const { return linkUp_; }

  /* Redraws the screen (called from the main loop). */
  void Update(uint32_t nowMs);

 private:
  void Draw(uint32_t nowMs);

  Adafruit_SSD1306* d_ = nullptr;
  bool rec_ = false;     /* OBS confirmed recording */
  bool obsUp_ = false;   /* obs-websocket connected */
  bool linkUp_ = false;  /* host bridge connected */
  float seconds_ = 0.0f; /* recording duration reported by OBS */
  char scene_[24] = {0};
  uint32_t pendingUntil_ = 0;
};

}  // namespace rec
