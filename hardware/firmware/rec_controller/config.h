#pragma once
/*
 * REC-1 desk recording controller - board / peripheral configuration.
 *
 * Board : Adafruit QT Py RP2040 (Adafruit product 4900)
 * Core  : rp2040:rp2040  ("Raspberry Pi Pico/RP2040/RP2350", Earle F. Philhower, 6.4.0)
 *
 * Pin map provenance
 *  - arduino-pico 6.4.0  variants/adafruit_qtpy/pins_arduino.h
 *    (that file cites Adafruit's official pinout asset https://learn.adafruit.com/assets/100337)
 *  - Adafruit_QT_Py-RP2040-PCB  (Eagle board file) for the castellated pad order:
 *      JP1 (left,  x=1.27 mm): A0 A1 A2 A3 SDA SCL TX   (top -> bottom)
 *      JP3 (right, x=16.51 mm): RX SCK MISO MOSI 3V3 GND 5V (bottom -> top)
 *    STEMMA QT connector CONN1: GND 3V3 SDA SCL  -> I2C1 (SDA=22, SCL=23)
 */

#define BOARD_LABEL "QT Py RP2040"

/* ------------------------------------------------------------------ buttons -- */
/* Active-low momentary switches, internal pull-up, wired to the perfboard.    */
#define BTN_RECORD_PIN    27u /* A2 / JP1 pad 3 */
#define BTN_SCENE_PIN     26u /* A3 / JP1 pad 4 */
#define BTN_DEBOUNCE_MS   25u /* raw state must be stable this long to count  */

/* ------------------------------------------------------- record indicator --- */
/* Red 3 mm LED: GPIO -> 330 R -> GND (GPIO sources the current).               */
#define LED_RECORD_PIN    28u /* A1 / JP1 pad 2 */

/* ------------------------------------------------------------- OLED screen -- */
/* Adafruit 1.3" 128x64 OLED (product 938) on the STEMMA QT port = I2C1.       */
#define OLED_I2C_ADDR     0x3C
#define OLED_RESET_PIN    -1
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64

/* --------------------------------------------------------------- host link -- */
/* USB CDC. The host bridge pushes status; the device asks for it with PING.   */
#define LINK_BAUD           115200
#define HOST_POLL_MS         10u  /* main loop poll period for the CDC buffer  */
#define HOST_PING_MS       1000u  /* device -> host liveness probe            */
#define HOST_LINK_TIMEOUT_MS 2000u  /* no host traffic for this long = link down */
#define HOST_PENDING_MS    2000u  /* how long a command stays "awaiting reply"  */
