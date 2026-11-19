/*
 * REC-1 preview - browser visualisation of the enclosure and the device
 * behaviour.  Plain Canvas 2D, no external assets, no network access.
 *
 * The dimensions come from preview/dims.js which is generated from
 * enclosure/dims.scad, so the drawing always matches the CAD model.
 *
 * Everything shown here is a SIMULATION: the geometry is taken from the CAD
 * dimensions, but no physical device was built or measured for this preview.
 */

const D = DIMS;

/* ---------------------------------------------------------------- state -- */
const state = {
  assembly: 0.55,     /* 0 = exploded, 1 = assembled            */
  linkUp: true,       /* host bridge connected over USB         */
  obsUp: true,        /* obs-websocket connected                */
  recording: false,   /* OBS confirmed recording state          */
  pending: false,     /* command sent, waiting for confirmation */
  scene: "Intro",
  seq: 0,
  log: [],
};

const SCENES = ["Intro", "Gameplay", "Outro"];

/* ------------------------------------------------------------- helpers -- */
const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);

function project(x, y, z, s, ox, oy) {
  return [ox + (x - y) * C30 * s, oy + ((x + y) * S30 - z) * s];
}

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawBox(ctx, x0, y0, z0, w, d, h, s, ox, oy, top, sideX, sideY, edge) {
  const x1 = x0 + w, y1 = y0 + d, z1 = z0 + h;
  const P = (x, y, z) => project(x, y, z, s, ox, oy);
  poly(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], sideY, edge);
  poly(ctx, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], sideX, edge);
  poly(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top, edge);
}

function drawCylinder(ctx, cx, cy, z0, dia, h, s, ox, oy, fill, edge) {
  const N = 20, r = dia / 2;
  const bottom = [], top = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    bottom.push(project(cx + r * Math.cos(a), cy + r * Math.sin(a), z0, s, ox, oy));
    top.push(project(cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + h, s, ox, oy));
  }
  poly(ctx, bottom, fill, edge);
  poly(ctx, top, fill, edge);
}

function drawWire(ctx, points, color, width) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const q = project(p[0], p[1], p[2], 1, 0, 0);
    if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/* ------------------------------------------------------------ iso view -- */
function drawIso(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#12151a";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const s = 4.6;
  const ox = 330, oy = 470;
  const t = state.assembly;
  const lift = (1 - t);

  /* bottom shell (simplified: outer box without the top face) */
  const shellTop = D.boss_top_z;
  const P = (x, y, z) => project(x, y, z, s, ox, oy);
  ctx.save();
  poly(ctx, [P(-D.case_w / 2, D.case_d / 2, 0), P(D.case_w / 2, D.case_d / 2, 0),
             P(D.case_w / 2, D.case_d / 2, shellTop), P(-D.case_w / 2, D.case_d / 2, shellTop)],
       "#2f3742", "#4a5563");
  poly(ctx, [P(D.case_w / 2, -D.case_d / 2, 0), P(D.case_w / 2, D.case_d / 2, 0),
             P(D.case_w / 2, D.case_d / 2, shellTop), P(D.case_w / 2, -D.case_d / 2, shellTop)],
       "#28303a", "#4a5563");
  /* cavity floor */
  poly(ctx, [P(-D.case_w / 2 + D.wall, -D.case_d / 2 + D.wall, D.floor_t),
             P(D.case_w / 2 - D.wall, -D.case_d / 2 + D.wall, D.floor_t),
             P(D.case_w / 2 - D.wall, D.case_d / 2 - D.wall, D.floor_t),
             P(-D.case_w / 2 + D.wall, D.case_d / 2 - D.wall, D.floor_t)],
       "#232a33", "#39424e");
  ctx.restore();

  /* OLED posts + module */
  const oledZ = D.floor_t + D.oled_post_h;
  for (const sx of [-1, 1]) {
    for (const py of [D.oled_post_y0, D.oled_post_y1]) {
      drawCylinder(ctx, sx * D.oled_post_x, py, D.floor_t, D.oled_post_od,
                   D.oled_post_h, s, ox, oy, "#3c4652", "#59636f");
    }
  }
  drawBox(ctx, D.oled_x - D.oled_mod_w / 2, D.oled_y0, oledZ + lift * 26,
          D.oled_mod_w, D.oled_mod_d, D.oled_mod_h, s, ox, oy,
          "#2b4d73", "#1f3a57", "#1f3a57", "#16283c");

  /* QT Py board in its cradle */
  const qtpZ = D.floor_t + D.cradle_h;
  drawBox(ctx, D.qtp_x0, D.qtp_y0, qtpZ + lift * 8, D.qtp_w, D.qtp_d, D.qtp_h,
          s, ox, oy, "#2f6f4f", "#23543b", "#23543b", "#17392a");

  /* buttons and LED (they live in the face panel) */
  const panelZ = D.case_h - D.panel_t;
  const btnZ = panelZ + lift * 70;
  for (const bx of [-D.btn_x, D.btn_x]) {
    drawCylinder(ctx, bx, D.btn_y, btnZ, D.btn_d, 4.6, s, ox, oy, "#7a5a24", "#a8813a");
  }
  drawCylinder(ctx, D.led_x, D.led_y, btnZ, D.led_d, 3.2, s, ox, oy,
               state.recording ? "#ff3b30" : "#5a2b28", "#8d3a36");

  /* face panel */
  const panelW = D.case_w - 2 * D.wall - 2 * D.panel_gap;
  const panelD = D.case_d - 2 * D.wall - 2 * D.panel_gap;
  const panelZf = panelZ + lift * 100;
  drawBox(ctx, -panelW / 2, -panelD / 2, panelZf, panelW, panelD, D.panel_t,
          s, ox, oy, "#39424e", "#2b333d", "#2b333d", "#4a5563");

  /* cut-outs in the face panel */
  const panelTop = panelZf + D.panel_t;
  poly(ctx, [P(-D.win_w / 2, D.win_y - D.win_h / 2, panelTop),
             P(D.win_w / 2, D.win_y - D.win_h / 2, panelTop),
             P(D.win_w / 2, D.win_y + D.win_h / 2, panelTop),
             P(-D.win_w / 2, D.win_y + D.win_h / 2, panelTop)], "#0d1218", "#5d86ad");
  for (const bx of [-D.btn_x, D.btn_x]) {
    const c = P(bx, D.btn_y, panelTop);
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], (D.btn_d / 2) * C30 * s, (D.btn_d / 2) * S30 * s, 0, 0, 7);
    ctx.fillStyle = "#0d1218"; ctx.fill();
    ctx.strokeStyle = "#5d86ad"; ctx.stroke();
  }
  {
    const c = P(D.led_x, D.led_y, panelTop);
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], (D.led_d / 2) * C30 * s, (D.led_d / 2) * S30 * s, 0, 0, 7);
    ctx.fillStyle = state.recording ? "#ff3b30" : "#0d1218"; ctx.fill();
  }
  /* M3 screws */
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      drawCylinder(ctx, sx * D.screw_x, sy * D.screw_y, panelTop, 5.5, 1.6, s, ox, oy,
                   "#8b97a6", "#c3ccd8");
    }
  }

  /* wiring: STEMMA QT cable + button wires + USB */
  const oledCable = [
    [D.oled_x + D.oled_mod_w / 2, D.oled_y0 + 4, oledZ + lift * 26],
    [D.oled_x + D.oled_mod_w / 2 + 4, D.oled_y0 + 4, oledZ + lift * 6],
    [D.qtp_x0 + 6, D.qtp_y0 + 2, D.floor_t + 4],
  ];
  ctx.save();
  ctx.translate(0, 0);
  const projS = (pts) => pts.map(p => project(p[0], p[1], p[2], s, ox, oy));
  const drawCable = (pts, color, w) => {
    const q = projS(pts);
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  };
  drawCable(oledCable, "#7b2f2f", 2.4);
  drawCable([[-D.btn_x, D.btn_y, panelZ], [-D.btn_x, D.btn_y, D.floor_t + 2],
             [D.qtp_x0 + 2, D.qtp_y0 + 6, D.floor_t + 2]], "#7b2f2f", 1.6);
  drawCable([[D.btn_x, D.btn_y, panelZ], [D.btn_x, D.btn_y, D.floor_t + 2],
             [D.qtp_x0 + 2, D.qtp_y0 + 6, D.floor_t + 2]], "#7b2f2f", 1.6);
  ctx.restore();

  /* captions */
  ctx.fillStyle = "#8b97a6";
  ctx.font = "13px ui-monospace, Menlo, monospace";
  ctx.fillText("enclosure " + D.case_w + " x " + D.case_d + " x " + D.case_h + " mm",
               24, 28);
  ctx.fillText("assembly " + Math.round(state.assembly * 100) + "%", 24, 48);
  ctx.fillStyle = "#ffd166";
  ctx.fillText("simplified shell drawing - exact geometry in enclosure/*.stl", 24, 68);
}

/* ----------------------------------------------------------- top view -- */
function drawTop(ctx, x0, y0, w, h) {
  ctx.clearRect(x0, y0, w, h);
  ctx.fillStyle = "#12151a";
  ctx.fillRect(x0, y0, w, h);
  ctx.save();
  ctx.translate(x0, y0);

  const k = Math.min(w / (D.case_w + 10), (h - 420) / (D.case_d + 10));
  const ox = w / 2, oy = 170;
  const X = (x) => ox + x * k;
  const Y = (y) => oy + y * k;

  ctx.strokeStyle = "#39424e";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#1d232b";
  ctx.beginPath();
  ctx.roundRect(X(-D.case_w / 2), Y(-D.case_d / 2), D.case_w * k, D.case_d * k, 4 * k);
  ctx.fill(); ctx.stroke();

  /* OLED module */
  ctx.fillStyle = "#2b4d73";
  ctx.fillRect(X(D.oled_x - D.oled_mod_w / 2), Y(D.oled_y0), D.oled_mod_w * k, D.oled_mod_d * k);
  ctx.strokeStyle = "#5d86ad";
  ctx.strokeRect(X(D.oled_x - D.oled_mod_w / 2), Y(D.oled_y0), D.oled_mod_w * k, D.oled_mod_d * k);
  /* screen area */
  ctx.fillStyle = "#0b1118";
  ctx.fillRect(X(D.oled_x - D.oled_mod_w / 2), Y(D.oled_y0 + D.oled_mod_d - 23), D.oled_mod_w * k, 23 * k);
  /* mounting holes */
  ctx.fillStyle = "#12151a";
  for (const sx of [-1, 1]) {
    for (const py of [D.oled_post_y0, D.oled_post_y1]) {
      ctx.beginPath();
      ctx.arc(X(sx * D.oled_post_x), Y(py), D.oled_hole_d * k / 2, 0, 7);
      ctx.fill();
    }
  }

  /* QT Py */
  ctx.fillStyle = "#2f6f4f";
  ctx.fillRect(X(D.qtp_x0), Y(D.qtp_y0), D.qtp_w * k, D.qtp_d * k);
  ctx.strokeStyle = "#5a9c78";
  ctx.strokeRect(X(D.qtp_x0), Y(D.qtp_y0), D.qtp_w * k, D.qtp_d * k);
  ctx.fillStyle = "#0b1118";
  ctx.fillRect(X(D.qtp_x0 + D.qtp_w / 2 - 5), Y(D.qtp_y0 + D.qtp_d - 1.5), 10 * k, 2.5 * k);
  /* castellated pads */
  ctx.fillStyle = "#c9a227";
  for (let i = 0; i < 7; i++) {
    const py = D.qtp_y0 + 2.9 + i * 2.54;
    ctx.fillRect(X(D.qtp_x0) + 0.5, Y(py), 1.6 * k, 1.2 * k);
    ctx.fillRect(X(D.qtp_x0 + D.qtp_w) - 2.1 * k, Y(py), 1.6 * k, 1.2 * k);
  }

  /* buttons + LED */
  ctx.fillStyle = "#7a5a24";
  for (const bx of [-D.btn_x, D.btn_x]) {
    ctx.beginPath();
    ctx.arc(X(bx), Y(D.btn_y), D.btn_d * k / 2, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = state.recording ? "#ff3b30" : "#5a2b28";
  ctx.beginPath();
  ctx.arc(X(D.led_x), Y(D.led_y), D.led_d * k / 2, 0, 7);
  ctx.fill();

  /* USB slot */
  ctx.strokeStyle = "#7b2f2f";
  ctx.lineWidth = 2;
  ctx.strokeRect(X(D.qtp_x0 + D.qtp_w / 2 - D.usb_slot_w / 2), Y(D.case_d / 2 - D.wall),
                 D.usb_slot_w * k, D.wall * k);

  /* annotations */
  ctx.fillStyle = "#8b97a6";
  ctx.font = "12px ui-monospace, Menlo, monospace";
  ctx.fillText("board placement (top view)", 16, 24);
  ctx.fillText("QT Py RP2040 " + D.qtp_w + " x " + D.qtp_d, X(D.qtp_x0 + D.qtp_w / 2), Y(D.qtp_y0) - 8);
  ctx.fillText("OLED 938 " + D.oled_mod_w + " x " + D.oled_mod_d, X(D.oled_x - D.oled_mod_w / 2), Y(D.oled_y0) - 8);
  ctx.fillText("USB-C slot", X(D.qtp_x0 + D.qtp_w / 2 - D.usb_slot_w / 2), Y(D.case_d / 2) + 16);

  /* parts legend below the drawing */
  const legend = [
    ["#2f6f4f", "QT Py RP2040 " + D.qtp_w + " x " + D.qtp_d + " mm, USB-C at the back"],
    ["#2b4d73", "OLED 938 " + D.oled_mod_w + " x " + D.oled_mod_d + " mm, holes " +
                D.oled_hole_dx + " x " + D.oled_hole_dy + " mm"],
    ["#7a5a24", "REC / SCENE buttons, 6 mm press fit"],
    ["#7b2f2f", "USB-C slot " + D.usb_slot_w + " x " + D.usb_slot_h + " mm"],
  ];
  ctx.font = "12px ui-monospace, Menlo, monospace";
  legend.forEach((item, i) => {
    const ly = 420 + i * 26;
    ctx.fillStyle = item[0];
    ctx.fillRect(20, ly - 9, 12, 12);
    ctx.fillStyle = "#8b97a6";
    ctx.fillText(item[1], 40, ly);
  });
  ctx.restore();
}

/* ------------------------------------------------------------- screen -- */
function drawCellText(ctx, text, x, y, cell, fontPx, color) {
  ctx.fillStyle = color;
  ctx.font = fontPx + "px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x + i * cell, y);
  }
}

function drawScreen(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, w, h);

  const k = w / 128;
  ctx.save();
  ctx.scale(k, k);

  const rec = state.recording;
  if (rec) {
    ctx.fillStyle = "#e8f0ff";
    ctx.beginPath();
    ctx.roundRect(0, 0, 14, 16, 3);
    ctx.fill();
  } else {
    ctx.strokeStyle = "#e8f0ff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, 13, 15, 3);
    ctx.stroke();
  }

  const secs = state.recording ? state.elapsed : 0;
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor(secs / 60) % 60).padStart(2, "0");
  const ss = String(Math.floor(secs) % 60).padStart(2, "0");
  drawCellText(ctx, hh + ":" + mm + ":" + ss, 20, 0, 12, 16, "#e8f0ff");

  drawCellText(ctx, state.linkUp ? "LINK:UP  " : "LINK:DOWN", 0, 20, 6, 8, "#9fb0c4");
  drawCellText(ctx, state.obsUp ? "OBS:UP" : "OBS:DOWN", 48, 20, 6, 8, "#9fb0c4");
  drawCellText(ctx, "SCENE:" + state.scene, 0, 30, 6, 8, "#9fb0c4");

  let banner, color = "#e8f0ff";
  if (!state.linkUp) { banner = "HOST LINK LOST"; color = "#ff6b60"; }
  else if (!state.obsUp) { banner = "OBS NOT CONNECTED"; color = "#ff6b60"; }
  else if (state.pending) { banner = "WAITING FOR OBS..."; color = "#ffd166"; }
  else if (rec) { banner = "RECORDING"; color = "#ff6b60"; }
  else { banner = "READY"; }
  drawCellText(ctx, banner, 0, 44, 6, 8, color);

  ctx.restore();
}

/* --------------------------------------------------------------- logic -- */
function log(line) {
  state.log.unshift(line);
  if (state.log.length > 12) state.log.pop();
  document.getElementById("status").textContent = state.log.join("\n");
}

function pressRecord() {
  if (!state.linkUp) { log("device -> CMD REC TOGGLE " + (++state.seq) + "   (no host)"); return; }
  state.seq += 1;
  log("device -> CMD REC TOGGLE " + state.seq);
  state.pending = true;
  setTimeout(() => {
    if (!state.linkUp || !state.obsUp) {
      state.pending = false;
      log("host   -> ACK REC " + state.seq + " ERR");
      render();
      return;
    }
    state.recording = !state.recording;
    state.pending = false;
    log("host   -> ACK REC " + state.seq + " OK");
    log("host   -> ST REC " + (state.recording ? 1 : 0));
    if (state.recording) state.elapsed = 0;
    render();
  }, 220);
}

function pressScene() {
  if (!state.linkUp || !state.obsUp) { log("device -> CMD SCENE NEXT (ignored)"); return; }
  state.seq += 1;
  log("device -> CMD SCENE NEXT " + state.seq);
  setTimeout(() => {
    const i = (SCENES.indexOf(state.scene) + 1) % SCENES.length;
    state.scene = SCENES[i];
    log("host   -> ST SCENE " + state.scene);
    render();
  }, 180);
}

/* -------------------------------------------------------------- render -- */
let timer = null;
function render() {
  drawIso(document.getElementById("scene").getContext("2d"));
  const top = document.getElementById("scene").getContext("2d");
  drawTop(top, 700, 0, 480, 1016);
  drawScreen(document.getElementById("screen").getContext("2d"));
  if (timer) clearInterval(timer);
  if (state.recording) {
    timer = setInterval(() => {
      state.elapsed += 1;
      drawScreen(document.getElementById("screen").getContext("2d"));
    }, 1000);
  }
}

/* --------------------------------------------------------------- wiring -- */
document.getElementById("assembly").addEventListener("input", (e) => {
  state.assembly = Number(e.target.value) / 100;
  document.getElementById("slider-value").textContent = e.target.value + "%";
  render();
});
document.getElementById("btn-rec").addEventListener("click", pressRecord);
document.getElementById("btn-scene").addEventListener("click", pressScene);
document.getElementById("btn-link").addEventListener("click", (e) => {
  state.linkUp = !state.linkUp;
  e.target.textContent = "Host link: " + (state.linkUp ? "up" : "down");
  e.target.classList.toggle("on", state.linkUp);
  log("host link " + (state.linkUp ? "restored" : "lost"));
  if (!state.linkUp) { state.recording = false; state.pending = false; }
  render();
});
document.getElementById("btn-obs").addEventListener("click", (e) => {
  state.obsUp = !state.obsUp;
  e.target.textContent = "OBS link: " + (state.obsUp ? "up" : "down");
  e.target.classList.toggle("on", state.obsUp);
  log("obs-websocket " + (state.obsUp ? "connected" : "disconnected"));
  if (!state.obsUp) { state.recording = false; state.pending = false; }
  render();
});
document.getElementById("btn-reset").addEventListener("click", () => {
  state.recording = false; state.pending = false; state.scene = "Intro";
  state.log = []; state.elapsed = 0;
  log("reset");
  render();
});

state.elapsed = 0;
log("device -> HELLO 1 1.0.0");
log("host   -> ST LINK 1");
log("host   -> ST OBS 1");
render();
