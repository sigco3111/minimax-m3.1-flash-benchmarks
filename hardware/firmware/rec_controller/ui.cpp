#include "ui.h"

#include <stdio.h>
#include <string.h>

#include "config.h"

namespace rec {
namespace {

/* "HH:MM:SS" */
void FormatClock(char* out, size_t cap, float seconds) {
  if (seconds < 0.0f) seconds = 0.0f;
  uint32_t total = static_cast<uint32_t>(seconds);
  uint32_t h = total / 3600u;
  uint32_t m = (total / 60u) % 60u;
  uint32_t s = total % 60u;
  snprintf(out, cap, "%02lu:%02lu:%02lu", (unsigned long)h, (unsigned long)m,
           (unsigned long)s);
}

void CopyText(char* dst, size_t cap, const char* src) {
  size_t i = 0;
  if (cap == 0) return;
  for (; src != nullptr && src[i] != '\0' && i + 1 < cap; ++i) dst[i] = src[i];
  dst[i] = '\0';
}

}  // namespace

void Ui::Begin(Adafruit_SSD1306* display) {
  d_ = display;
  if (d_ != nullptr) {
    d_->clearDisplay();
    d_->setTextColor(SSD1306_WHITE);
    d_->display();
  }
}

void Ui::ApplyStatus(const Message& msg) {
  switch (msg.status) {
    case StatusId::kRec:
      rec_ = msg.flag;
      if (!msg.flag) seconds_ = 0.0f;
      break;
    case StatusId::kObs:
      obsUp_ = msg.flag;
      if (!msg.flag) {
        rec_ = false;   /* recording state is unknown without OBS */
        seconds_ = 0.0f;
      }
      break;
    case StatusId::kTime:
      seconds_ = msg.seconds;
      break;
    case StatusId::kScene:
      CopyText(scene_, sizeof(scene_), msg.text);
      break;
    case StatusId::kLink:
      linkUp_ = msg.flag;
      break;
    default:
      break;
  }
}

void Ui::SetLinkUp(bool up) {
  linkUp_ = up;
  if (!up) {
    obsUp_ = false;
    rec_ = false;
    seconds_ = 0.0f;
  }
}

void Ui::MarkCommandPending(uint32_t nowMs) {
  pendingUntil_ = nowMs + HOST_PENDING_MS;
}

void Ui::Update(uint32_t nowMs) {
  Draw(nowMs);
}

void Ui::Draw(uint32_t nowMs) {
  if (d_ == nullptr) return;

  char clock[16] = {0};
  FormatClock(clock, sizeof(clock), seconds_);

  d_->clearDisplay();
  d_->setTextColor(SSD1306_WHITE);

  /* Top row: recording block + timer (text size 2 = 12x16 px per char). */
  if (rec_) {
    d_->fillRoundRect(0, 0, 14, 16, 3, SSD1306_WHITE);
  } else {
    d_->drawRoundRect(0, 0, 14, 16, 3, SSD1306_WHITE);
  }
  d_->setTextSize(2);
  d_->setTextColor(SSD1306_WHITE);
  d_->setCursor(20, 0);
  d_->print(clock);

  /* Status rows (text size 1 = 6x8 px per char). */
  d_->setTextSize(1);
  d_->setCursor(0, 20);
  d_->print(linkUp_ ? "LINK:UP  " : "LINK:DOWN");
  d_->print(obsUp_ ? "OBS:UP" : "OBS:DOWN");

  d_->setCursor(0, 30);
  d_->print("SCENE:");
  d_->print(scene_[0] != '\0' ? scene_ : "-");

  /* Banner: the most important state wins. */
  d_->setCursor(0, 44);
  if (!linkUp_) {
    d_->print("HOST LINK LOST");
  } else if (!obsUp_) {
    d_->print("OBS NOT CONNECTED");
  } else if (Pending(nowMs)) {
    d_->print("WAITING FOR OBS...");
  } else if (rec_) {
    d_->print("RECORDING");
  } else {
    d_->print("READY");
  }

  d_->display();
}

}  // namespace rec
