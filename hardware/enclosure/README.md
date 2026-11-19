# REC-1 enclosure

Two printed parts that hold the electronics of the controller.

```
enclosure/
  dims.scad        every dimension with its manufacturer source
  rec1_case.scad   the parametric model (bottom shell / face panel)
  rec1_bottom.stl  printable tub
  rec1_top.stl     printable face panel
  build.sh         renders the STLs and runs the geometry check
  check_model.py   asserts the geometry of the exported STLs
```

## Build

```bash
cd enclosure
./build.sh                       # uses `openscad` from PATH
OPENSCAD=/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD ./build.sh
```

Rendering takes a few seconds; `check_model.py` then parses both STLs and
verifies the outer dimensions, the position of every hole and the
interference-critical clearances.

## Print settings

| Setting | Value |
|---------|-------|
| Material | PLA or PETG |
| Layer height | 0.16 mm |
| Perimeters | 3 |
| Infill | 20 % (the bosses and the OLED posts need solid perimeters, not infill) |
| Supports | none |
| Tolerance | the model is already fitted (press fits, nut pockets) |

Print the face panel **upside down** (the embossed labels face the bed) so
the labels come out smooth.

## Dimension sources

| Feature | Value | Source |
|---------|-------|--------|
| Case outer | 96 × 58 × 21 mm | design decision |
| Wall / floor / panel | 2.5 / 2.0 / 2.5 mm | design decision, printable and rigid enough for a desk device |
| Corner bosses | Ø7.0 mm, M3 nut pocket Ø5.8 × 4.4 deep | M3 hex nut is 5.5 mm across flats and 4 mm thick (ISO 4032) |
| OLED posts | Ø6.0 mm, M2.5 nut pocket Ø4.8 × 3.4 deep | M2.5 hex nut is 4.6 mm across flats, 3.2 mm thick |
| OLED window | 35.6 × 24.0 mm | glass 34.5 × 23.0 mm + 0.5 mm margin (Adafruit 938) |
| OLED mounting | holes 30.5 × 28.0 mm, Ø2.5 mm | Adafruit 938 |
| Button holes | Ø6.05 mm | Omron B3F-1000 body 6.0 mm (Adafruit 367) |
| LED hole | Ø3.2 mm | 3 mm LED body (Adafruit 777) |
| QT Py cradle | 18.78 × 22.8 mm pocket, 1.6 mm deep | board 17.78 mm + 0.5 mm clearance per side (Adafruit 4900 / official Eagle file) |
| USB-C slot | 8 × 4 mm in the back wall | USB-C receptacle opening 8.94 × 2.56 mm + clearance |
| Screw positions | ±41 / ±22 mm | design decision, clear of all components |

## Assumptions (not published by the manufacturer)

1. **The OLED glass sits at the top of its PCB.** Adafruit publishes the PCB
   as 35.6 × 33.0 mm and the glass as 34.5 × 23.0 mm; the 10 mm difference is
   assumed to be the bare part of the PCB at the bottom (connector and
   passives). If the glass is centred instead, the window has to move 5 mm
   towards the front — change `win_y` in `dims.scad` and re-render.
2. **The STEMMA QT connector of the OLED is on the left edge of the module.**
   The 100 mm cable reaches either way; if the cable does not reach, turn the
   module 180° before mounting.
3. **The Omron B3F-1000 lead pitch is 4.5 mm** — only used to plan the wire
   routing, not for a hole.
4. **The USB-C receptacle opening is 8.94 × 2.56 mm** — the standard
   receptacle aperture; the 8 × 4 mm slot gives 1 mm of clearance per side
   and 0.7 mm above/below.
5. **The button hole is a press fit.** With a 6.05 mm hole the 6.0 mm switch
   is held by interference; if the printer is running large, the switch can
   be fixed with a drop of adhesive.

## Interference check (what `check_model.py` proves)

* Outer envelope: 96.00 × 58.00 × 21.00 mm exactly.
* Face panel: 90.80 × 52.80 × 2.5 mm, underside at z = 18.5 mm, labels add
  0.4 mm.
* The face panel edge (45.40 mm) fits into the cavity wall (45.50 mm).
* The OLED glass surface (z = 18.2 mm) clears the panel underside
  (z = 18.5 mm) by 0.3 mm.
* The boss tops are exactly at z = 18.5 mm, i.e. the panel rests on them.
* Every hole of the design is present at the expected position and diameter:
  4 × M3 boss holes, 4 × OLED post holes, 2 × button holes, 1 × LED hole,
  4 × panel screw holes.

What the check **cannot** prove: it works on the exported mesh, not on the
real printed part or on the real modules. Clearance to the actual OLED glass
edge and to the actual USB plug overmould can only be confirmed with the
parts in hand (see the acceptance list in `VERIFICATION.md`).
