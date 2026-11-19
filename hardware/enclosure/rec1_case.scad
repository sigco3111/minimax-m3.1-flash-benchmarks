/*
 * REC-1 desk recording controller - enclosure (OpenSCAD, parametric).
 *
 *   parts:  rec1_bottom.stl  (tub with bosses, OLED posts, board cradle)
 *           rec1_top.stl     (face panel: OLED window, 2 buttons, LED, labels)
 *
 * Build (see build.sh):
 *   openscad -o rec1_bottom.stl -D 'part="bottom"' rec1_case.scad
 *   openscad -o rec1_top.stl    -D 'part="top"'    rec1_case.scad
 *
 * All dimensions live in dims.scad.
 *
 * Coordinate system (case centred on the origin):
 *   +X = right, +Y = towards the back (USB-C), +Z = up
 */

include <dims.scad>

part = "both";   // "bottom" | "top" | "both"  (override with -D)

/* Even segment count so that every polygon has vertices on the X and Y axes
 * (otherwise the hull of the rounded corners would be slightly asymmetric). */
$fn = 24;

/* ------------------------------------------------------------- helpers -- */

/* Rounded rectangle prism (hull of four corner cylinders). */
module rrect(w, d, r, h) {
    r = min(r, w / 2 - 0.01, d / 2 - 0.01);
    hull()
        for (x = [-w / 2 + r, w / 2 - r], y = [-d / 2 + r, d / 2 - r])
            translate([x, y, 0]) cylinder(d = 2 * r, h = h);
}

/* Rounded rectangle *hole* helper (same shape, used with difference()). */
module rrect_hole(w, d, r, h, z = 0) {
    translate([0, 0, z]) rrect(w, d, r, h);
}

/* ------------------------------------------------------------ bottom -- */
module bottom_shell() {
    difference() {
        union() {
            /* outer body with the main cavity */
            difference() {
                rrect(case_w, case_d, corner_r, case_h);
                rrect_hole(case_w - 2 * wall, case_d - 2 * wall, corner_r - wall,
                           case_h - floor_t + 0.01, floor_t);
            }

            /* corner bosses (M3 self tapping) - they carry the face panel */
            for (sx = [-1, 1], sy = [-1, 1])
                translate([sx * screw_x, sy * screw_y, floor_t])
                    cylinder(d = boss_od, h = boss_top_z - floor_t);

            /* OLED mounting posts (M2.5 self tapping) */
            for (sx = [-1, 1], py = [oled_post_y0, oled_post_y1])
                translate([sx * oled_post_x, py, floor_t])
                    cylinder(d = oled_post_od, h = oled_post_h);
        }

        /* boss: through hole + nut pocket (M3 nylon screw + nut) */
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * screw_x, sy * screw_y, boss_top_z - boss_nut_h])
                cylinder(d = boss_nut_d, h = boss_nut_h + 0.01);
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * screw_x, sy * screw_y, floor_t])
                cylinder(d = boss_hole, h = boss_top_z - floor_t + 0.01);

        /* OLED post: through hole + nut pocket (M2.5 nylon screw + nut) */
        for (sx = [-1, 1], py = [oled_post_y0, oled_post_y1])
            translate([sx * oled_post_x, py, floor_t + oled_post_h - oled_nut_h])
                cylinder(d = oled_nut_d, h = oled_nut_h + 0.01);
        for (sx = [-1, 1], py = [oled_post_y0, oled_post_y1])
            translate([sx * oled_post_x, py, floor_t])
                cylinder(d = oled_post_hole, h = oled_post_h + 0.01);

        /* cradle for the QT Py board */
        translate([qtp_x0 - cradle_gap, qtp_y0 - cradle_gap, floor_t - 0.01])
            rrect(qtp_w + 2 * cradle_gap, qtp_d + 2 * cradle_gap, 1.5,
                  cradle_h + 0.01);

        /* USB-C cable slot in the back wall */
        translate([qtp_x0 + qtp_w / 2 - usb_slot_w / 2,
                   case_d / 2 - wall - 0.01,
                   usb_z - usb_slot_h / 2])
            cube([usb_slot_w, wall + 0.02, usb_slot_h]);
    }
}

/* --------------------------------------------------------------- top -- */
module top_panel() {
    difference() {
        union() {
            translate([0, 0, case_h - panel_t])
                rrect(case_w - 2 * wall - 2 * panel_gap,
                      case_d - 2 * wall - 2 * panel_gap, panel_r, panel_t);

            /* embossed labels */
            translate([-btn_x, btn_label_y, case_h])
                linear_extrude(height = label_h)
                    text("REC", size = 3.0, halign = "center", valign = "center",
                         font = "Arial:style=Bold");
            translate([btn_x, btn_label_y, case_h])
                linear_extrude(height = label_h)
                    text("SCENE", size = 3.0, halign = "center", valign = "center",
                         font = "Arial:style=Bold");
            /* ring around the record LED */
            translate([led_x, led_y, case_h])
                linear_extrude(height = label_h)
                    difference() {
                        circle(d = led_ring_d);
                        circle(d = led_d);
                    }
        }

        /* OLED window */
        translate([0, win_y, case_h - panel_t - 0.01])
            rrect(win_w, win_h, win_r, panel_t + 0.02);

        /* button holes (press fit for the 6.0 mm switch body) */
        for (bx = [-btn_x, btn_x])
            translate([bx, btn_y, case_h - panel_t - 0.01])
                cylinder(d = btn_d, h = panel_t + 0.02);

        /* LED hole */
        translate([led_x, led_y, case_h - panel_t - 0.01])
            cylinder(d = led_d, h = panel_t + 0.02);

        /* screw clearance holes */
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * screw_x, sy * screw_y, case_h - panel_t - 0.01])
                cylinder(d = screw_d, h = panel_t + 0.02);
    }
}

/* ------------------------------------------------------------- scene -- */
if (part == "bottom" || part == "both") bottom_shell();
if (part == "top" || part == "both") top_panel();
