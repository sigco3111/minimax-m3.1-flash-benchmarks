# REC-1 preview

A local, self-contained visualisation of the controller. No server, no build
step, no external assets (no CDN, no fonts, no 3D library): it is plain HTML,
CSS and Canvas 2D.

## Run

```bash
# open the file directly ...
open preview/index.html

# ... or serve it (recommended, some browsers restrict file://)
python3 -m http.server 8000 --directory .
# then http://localhost:8000/preview/index.html
```

The page is designed for a 1920 × 1080 screen (fixed 1920 × 1080 canvas), so
it can be captured directly for a video.

## What it shows

| Area | Content |
|------|---------|
| Left | isometric view of the case: bottom shell, OLED module, QT Py board, buttons, LED, face panel, wiring |
| Right (top) | board placement in a top view with the real dimensions and a legend |
| Right | simulation of the 128 × 64 OLED (same layout as `firmware/rec_controller/ui.cpp`) |
| Right | controls: REC / SCENE button, host link, OBS link, reset |
| Right | simulated protocol traffic (the lines the real device and host would exchange) |
| Bottom | colour legend and the key data of the design |

The **assembly slider** moves the face panel (and the other parts) between
the assembled state and the exploded state — drag it for an assembly
animation.

## Simulation vs. reality

Everything in the preview is a **simulation**:

* The geometry comes from the CAD dimension table, so the proportions are
  real, but the shell is drawn in a simplified way (no threads, no fillets on
  the inner edges).
* The screen content is a re-implementation of the firmware layout, not the
  firmware itself; the font differs from the 6 × 8 pixel font of the SSD1306.
* The button presses, the link toggles and the scene changes are scripted
  locally; no device and no OBS are involved.

The banner in the header says so as well.

## Keeping it in sync with the CAD

`preview/dims.js` is generated from `enclosure/dims.scad`:

```bash
python3 preview/sync_dims.py
```

If the dimension table changes, re-run the command and the preview follows.
