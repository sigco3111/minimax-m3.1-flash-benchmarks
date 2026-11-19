/*
 * REC-1 enclosure - parameter source of truth.
 *
 * Every dimension that comes from a manufacturer is annotated with its
 * source.  Nothing in this file may be invented: if a value is not published
 * it is marked as an assumption and listed in enclosure/README.md.
 *
 * Units: millimetres.
 *
 * Manufacturer data used
 *  - Adafruit QT Py RP2040 (product 4900)
 *      * PCB outline 17.78 x 20.70 with 2.54 chamfered corners
 *        (Adafruit_QT_Py-RP2040-PCB, official Eagle board file)
 *      * product dimensions 21.8 x 17.8 x 5.8 (incl. USB-C overhang)
 *        (https://www.adafruit.com/product/4900)
 *      * USB-C receptacle: opening 9.0 x 4.0 (USB Type-C receptacle aperture
 *        plus 0.5 mm clearance; the board file lists the connector at the
 *        board centre, x = 8.89 mm)
 *      * STEMMA QT connector: JST SH 4, order GND / 3V / SDA / SCL
 *        (both boards use the same order, so the stock cable is unambiguous)
 *  - Adafruit 1.3" 128x64 OLED (product 938)
 *      * PCB 35.6 x 33.0 x 6.2, screen 34.5 x 23.0, active area 29.42 x 14.70
 *      * mounting holes 30.5 x 28.0 spacing, diameter 2.5
 *      * module glass sits at the top of the PCB, the remaining 10 mm of the
 *        PCB carries the connector and the passives  (ASSUMPTION, see README)
 *      * ~40 mA average from 3.3 V
 *  - Omron B3F-1000 tactile switch (Adafruit product 367)
 *      * body 6.0 x 6.0 x 5.0, 4 leads, 4.5 mm lead pitch (ASSUMPTION for the
 *        pitch - the Adafruit page only states the body size)
 *  - 3 mm diffused LED (Adafruit product 777): body diameter 3.0
 */

/* ------------------------------------------------------------- enclosure -- */
case_w      = 96;    /* outer width  (X)                              */
case_d      = 58;    /* outer depth  (Y)                              */
case_h      = 21;    /* outer height (Z)                              */
wall        = 2.5;   /* side wall thickness                           */
floor_t     = 2.0;   /* floor thickness                               */
corner_r    = 4.0;   /* outer corner radius                           */
panel_t     = 2.5;   /* top panel thickness                           */
panel_r     = 3.0;   /* top panel corner radius                       */
panel_gap   = 0.1;   /* clearance between panel edge and cavity wall  */
label_h     = 0.4;   /* height of the embossed labels                 */

/* ------------------------------------------------------- corner bosses -- */
screw_x     = 41;    /* boss / screw position from the centre (X)     */
screw_y     = 22;    /* boss / screw position from the centre (Y)     */
boss_od     = 7.0;   /* boss outer diameter                           */
boss_hole   = 3.3;   /* through hole for the M3 screw                 */
boss_nut_d  = 5.8;   /* pocket for the M3 hex nut (5.5 A/F)           */
boss_nut_h  = 4.4;   /* nut pocket depth (M3 nut is 4 mm thick)       */
boss_top_z  = 18.5;  /* boss top = underside of the top panel         */
screw_d     = 3.4;   /* clearance hole in the panel                   */

/* ------------------------------------------------------- OLED mounting -- */
oled_mod_w  = 35.6;  /* module PCB width                              */
oled_mod_d  = 33.0;  /* module PCB depth                              */
oled_mod_h  = 6.2;   /* module height (PCB + glass)                   */
oled_x      = 0;     /* module centre X                               */
oled_y0     = -17;   /* module front edge (Y)                         */
oled_hole_dx = 30.5; /* mounting hole spacing X                       */
oled_hole_dy = 28.0; /* mounting hole spacing Y                       */
oled_hole_d  = 2.5;  /* mounting hole diameter (M2.5 clearance)       */
oled_post_od = 6.0;  /* printed post diameter                         */
oled_post_h  = 10.0; /* post height above the floor                   */
oled_post_hole = 2.7; /* through hole for the M2.5 screw              */
oled_nut_d   = 4.8;  /* pocket for the M2.5 hex nut                   */
oled_nut_h   = 3.4;  /* nut pocket depth (M2.5 nut is 3.2 mm thick)  */
oled_post_x  = oled_hole_dx / 2;
oled_post_y0 = oled_y0 + (oled_mod_d - oled_hole_dy) / 2;  /* = -14.5 */
oled_post_y1 = oled_y0 + (oled_mod_d + oled_hole_dy) / 2;  /* = +13.5 */
/* OLED mounting screws: M2.5 with a nut in the printed post          */

/* Glass window in the top panel (the glass is 34.5 x 23.0 on the PCB). */
win_w       = 35.6;
win_h       = 24.0;
win_r       = 1.5;
win_y       = oled_y0 + oled_mod_d - 23.0 / 2;   /* glass centre = 4.5   */

/* -------------------------------------------------------------- buttons -- */
btn_d       = 6.05;  /* press fit hole for the 6.0 mm switch body      */
btn_x       = 28;    /* REC at -btn_x, SCENE at +btn_x                  */
btn_y       = -23;
btn_label_y = -14;   /* embossed label centre                          */

/* ------------------------------------------------------------------ LED -- */
led_d       = 3.2;   /* hole for the 3 mm diffused LED                 */
led_x       = 0;
led_y       = -23;
led_ring_d  = 6.4;   /* embossed ring around the LED                   */

/* ------------------------------------------------------- QT Py RP2040 --- */
qtp_w       = 17.78; /* PCB width  (X)                                 */
qtp_d       = 21.8;  /* incl. USB-C overhang (Y)                       */
qtp_h       = 5.8;   /* board height                                  */
qtp_x0      = 19.0;  /* board left edge (X)                            */
qtp_y0      = 3.0;   /* board front edge (Y)                           */
cradle_gap  = 0.5;   /* clearance around the board in the cradle       */
cradle_h    = 1.6;   /* cradle depth (board bottom side clearance)     */
usb_slot_w  = 8.0;   /* USB cable slot in the back wall                */
usb_slot_h  = 4.0;
usb_z       = 11;    /* slot centre height                             */
