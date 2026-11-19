/* =========================================================
   한강시: 노을을 쫓아 — 공용 유틸 / 절차적 텍스처
   ========================================================= */
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function approachAngle(a, b, maxStep) { const d = wrapAngle(b - a); return a + clamp(d, -maxStep, maxStep); }

/* 결정적 난수 (월 생성은 시드 기반, 시뮬레이션은 simRng 단일 스트림) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2i(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const randRange = (rng, a, b) => a + (b - a) * rng();

/* ---------------- 캔버스 텍스처 생성 ---------------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, opt) {
  opt = opt || {};
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opt.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opt.aniso || 8;
  if (opt.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function rgbCss(c, m) { m = m === undefined ? 1 : m; return 'rgb(' + Math.round(clamp(c[0] * m, 0, 1) * 255) + ',' + Math.round(clamp(c[1] * m, 0, 1) * 255) + ',' + Math.round(clamp(c[2] * m, 0, 1) * 255) + ')'; }

/* 파사드(외벽) 스타일 — 텍스처 1칸 = 창 1개 */
const FACADE_STYLES = [
  { key: 'glass',  wall: [0.30, 0.35, 0.43], glass: [0.17, 0.27, 0.37], cell: [2.7, 3.4], rect: [0.10, 0.16, 0.90, 0.78], lit: 0.34, rough: 0.45, metal: 0.25 },
  { key: 'office', wall: [0.64, 0.62, 0.58], glass: [0.31, 0.39, 0.46], cell: [2.3, 3.2], rect: [0.14, 0.20, 0.86, 0.74], lit: 0.30, rough: 0.85, metal: 0.02 },
  { key: 'brick',  wall: [0.50, 0.32, 0.27], glass: [0.21, 0.23, 0.27], cell: [2.0, 3.0], rect: [0.22, 0.26, 0.78, 0.72], lit: 0.46, rough: 0.95, metal: 0.0 },
  { key: 'apt',    wall: [0.57, 0.55, 0.51], glass: [0.27, 0.31, 0.35], cell: [2.1, 2.9], rect: [0.20, 0.24, 0.80, 0.70], lit: 0.42, rough: 0.9, metal: 0.0 },
  { key: 'shop',   wall: [0.42, 0.39, 0.41], glass: [0.23, 0.27, 0.31], cell: [2.5, 3.6], rect: [0.16, 0.18, 0.84, 0.72], lit: 0.52, rough: 0.8, metal: 0.05 },
  { key: 'ind',    wall: [0.44, 0.47, 0.46], glass: [0.25, 0.29, 0.29], cell: [3.4, 3.4], rect: [0.20, 0.22, 0.80, 0.70], lit: 0.24, rough: 0.9, metal: 0.08 }
];

function makeFacadeTexture(style) {
  const S = 64;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const rng = mulberry32(hash2i(style.key.length * 977, style.wall[0] * 1000) | 0);
  // 벽
  ctx.fillStyle = rgbCss(style.wall);
  ctx.fillRect(0, 0, S, S);
  // 벽 노이즈 (줄눈/얼룩)
  for (let i = 0; i < 1400; i++) {
    const x = rng() * S, y = rng() * S, v = (rng() - 0.5) * 0.16;
    ctx.fillStyle = 'rgba(' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + Math.abs(v).toFixed(3) + ')';
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  // 창
  const x0 = Math.round(style.rect[0] * S), y0 = Math.round(style.rect[1] * S);
  const x1 = Math.round(style.rect[2] * S), y1 = Math.round(style.rect[3] * S);
  const gg = ctx.createLinearGradient(x0, 0, x1, 0);
  gg.addColorStop(0, rgbCss(style.glass, 0.82));
  gg.addColorStop(0.45, rgbCss(style.glass, 1.25));
  gg.addColorStop(1, rgbCss(style.glass, 0.7));
  ctx.fillStyle = gg;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // 창 구분 프레임
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo((x0 + x1) / 2 + 0.5, y0); ctx.lineTo((x0 + x1) / 2 + 0.5, y1); ctx.stroke();
  return cv;
}

/* 보행자/차량/가로등 등 단순 색상 머티리얼용 헬퍼 */
function flatMaterial(color, rough, metal) {
  return new THREE.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.8 : rough, metalness: metal === undefined ? 0.05 : metal });
}

/* 네온 간판 아틀라스 (8x8 = 64종) */
const SIGN_WORDS = [
  '안마', '노래방', '약국', '호프', '떡볶이', '치킨', '커피', '바둑방',
  '찜질방', '세탁소', '부동산', '미용실', '포차', '칼국수', '심야영업', '유통기한',
  '전통주', '민박', '운전학원', '전세버스', '문구사', '피자', '냉면', '수제김밥',
  '방앗간', '오락실', '복합문화', '노블lit', '수족관', '문배술집', '우체국', '세탁소',
  '부동산', '분식', '만두', '장충동', '보약밥', '기원', '신당', '만화방',
  '방앗간', '골목', '어묵', '다방', '학원', '의류', '잡화', '식당',
  '정육점', '문구', '철물', '가전', '안경', '치과', '한의원', '약국'
];
const SIGN_COLORS = ['#ff4d6d', '#4dd2ff', '#ffd24d', '#8b5cf6', '#3ef2a0', '#ff8a3d', '#ff5cf0', '#7ef9ff'];

function makeSignAtlas() {
  const T = 128, COLS = 8, ROWS = 8;
  const cv = makeCanvas(T * COLS, T * ROWS);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 64; i++) {
    const cx = (i % COLS) * T, cy = Math.floor(i / COLS) * T;
    const col = SIGN_COLORS[i % SIGN_COLORS.length];
    const word = SIGN_WORDS[i % SIGN_WORDS.length];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(10,10,14,0.92)';
    ctx.fillRect(2, 2, T - 4, T - 4);
    ctx.shadowColor = col; ctx.shadowBlur = 26;
    ctx.strokeStyle = col; ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, T - 24, T - 24);
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = word.length > 4 ? 26 : word.length > 3 ? 32 : 40;
    ctx.font = '700 ' + fs + 'px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.shadowBlur = 22; ctx.shadowColor = col;
    ctx.fillText(word, T / 2, T / 2 + 2);
    ctx.restore();
  }
  return { canvas: cv, cols: COLS, rows: ROWS, tiles: 64 };
}

/* 편의점/상가 파사드 아틀라스 (4 x 2 = 8종) */
const STORE_WORDS = ['편의점', '노을마트', '골목상회', '새벽분식', '강변정육', '우체书店', '시내마트', '하루문구'];
function makeStoreAtlas() {
  const W = 256, H = 128, COLS = 4, ROWS = 2;
  const cv = makeCanvas(W * COLS, H * ROWS);
  const ctx = cv.getContext('2d');
  for (let i = 0; i < COLS * ROWS; i++) {
    const cx = (i % COLS) * W, cy = Math.floor(i / COLS) * H;
    const rng = mulberry32(1000 + i * 77);
    const hue = rng();
    const accent = ['#ff5a3c', '#2ad4c8', '#ffd23f', '#ff4d9d'][i % 4];
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#d8d2c4'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2b2f38'; ctx.fillRect(0, 0, W, 34);           // 상단 간판 띠
    ctx.fillStyle = accent; ctx.fillRect(0, 30, W, 5);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 22px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    ctx.fillText(STORE_WORDS[i % STORE_WORDS.length], W / 2, 17);
    // 유리창 + 선반
    ctx.fillStyle = '#141a22'; ctx.fillRect(12, 44, W - 24, H - 56);
    for (let s = 0; s < 4; s++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.06 + s * 0.05) + ')';
      ctx.fillRect(12, 46 + s * 16, W - 24, 3);
      for (let k = 0; k < 9; k++) {
        const rx = 18 + k * ((W - 40) / 9), ry = 50 + s * 16;
        ctx.fillStyle = ['#e8556d', '#4aa3ff', '#ffd23f', '#66d17a', '#e8e8e8'][Math.floor(rng() * 5)];
        ctx.fillRect(rx, ry - 8, 6 + rng() * 6, 8);
      }
    }
    ctx.strokeStyle = '#6d7480'; ctx.lineWidth = 3; ctx.strokeRect(12, 44, W - 24, H - 56);
    ctx.restore();
  }
  return { canvas: cv, cols: COLS, rows: ROWS, tiles: COLS * ROWS };
}

/* 물결 노멀맵 */
function makeWaterNormal() {
  const S = 128;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S * TAU, v = y / S * TAU;
      const nx = Math.sin(u * 3 + Math.cos(v * 2) * 1.2) * 0.35 + Math.sin(u * 7.3 + v * 2.1) * 0.14;
      const ny = Math.cos(v * 4 + Math.sin(u * 1.7) * 1.1) * 0.35 + Math.cos(v * 9.1 + u * 3.3) * 0.12;
      d[i] = Math.round((nx * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* 소프트 라디얼 글로우 (네온 후광 / 가로등 바닥광) */
function makeGlowTexture() {
  const S = 128;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return cv;
}
