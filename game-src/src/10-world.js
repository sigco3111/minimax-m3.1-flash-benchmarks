/* =========================================================
   한강시 — 도시 생성 (절차적 블록 / 도로 / 강 / 다리 / 고가도로 / 옥상 코스)
   ========================================================= */

const CITY = {
  GRID: 14,            // 블록 격자
  TILE: 76,            // 블록 한 칸 (블록 58 + 도로 18)
  ROAD: 18,
  HALF: 14 * 76 / 2,   // 532
  RIVER_Z0: -67,
  RIVER_Z1: 67,
  BRIDGE_X: [-228, 304],   // 두 개의 다리 (수직 도로 k=4, k=11)
  BRIDGE_H: 7,
  EXPR_Z: -152,            // 고가도로 (수평 도로 k=5)
  EXPR_H: 14,
  EXPRESS_W: 22,
  DECK: 0.16
};
CITY.WORLD = CITY.GRID * CITY.TILE;

const DIST_NAMES = ['한들동', '새롬동', '범인동', '다솜동', '은정동', '강빛동', '노을동', '유성동', '깃발동', '물빛동', '새봄동', '중앙로', '갈마동', '은하동'];

/* ---- 블록/건물 데이터 ---- */
const CITYDATA = {
  blocks: [],       // {i,j,type,dist,name,x0,z0,x1,z1,buildings:[],style}
  buildings: [],    // {x,z,w,d,h,style,tint,podium}
  signs: [],        // {x,y,z,rot,tile,scale,color}
  stores: [],       // {x,y,z,rot,tile,scale}
  streetlights: [], // {x,z,rot}
  trees: [],
  props: [],        // {kind,x,y,z,rot,s,color}
  parked: [],       // {x,z,rot,color}
  skyCourse: { platforms: [], checkpoints: [], start: {x:0,z:0} },
  nodes: [], edges: [], // 교통 네트워크
  colliderGrid: new Map()
};

const cellRect = (i, j) => {
  const x0 = -CITY.HALF + i * CITY.TILE + CITY.ROAD / 2;
  const z0 = -CITY.HALF + j * CITY.TILE + CITY.ROAD / 2;
  return { x0, z0, x1: x0 + CITY.TILE - CITY.ROAD, z1: z0 + CITY.TILE - CITY.ROAD };
};
/* 가장 가까운 도로를 향하는 방향 — 간판/상가 배치용 */
function streetFacing(x, z, w, d) {
  const kx = Math.round((x + CITY.HALF) / CITY.TILE);
  const kz = Math.round((z + CITY.HALF) / CITY.TILE);
  const rx = roadX(kx), rz = roadZ(kz);
  if (Math.abs(x - rx) < Math.abs(z - rz)) {
    const s = Math.sign(rx - x) || 1;
    return { x: x + s * (w / 2 + 0.35), z: z, rot: s > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  const s = Math.sign(rz - z) || 1;
  return { x: x, z: z + s * (d / 2 + 0.35), rot: s > 0 ? 0 : Math.PI };
}
const roadX = (k) => -CITY.HALF + k * CITY.TILE;
const roadZ = (l) => -CITY.HALF + l * CITY.TILE;
const isRiverRow = (j) => j === 6 || j === 7;

function districtProfile(i, j) {
  if (isRiverRow(j)) return 'river';
  if (i >= 7 && j >= 9 && i <= 8 && j <= 10) return 'sky';
  if (j < 6) { if (i >= 8) return 'biz'; if (i >= 3) return 'comm'; return 'hood'; }
  if (i >= 9) return 'biz';
  if (i >= 4) return 'hood2';
  return 'old';
}
const DISTRICT_WEIGHTS = {
  biz:   [['tower', 0.58], ['midrise', 0.24], ['plaza', 0.10], ['park', 0.08]],
  comm:  [['shop', 0.42], ['midrise', 0.28], ['park', 0.14], ['plaza', 0.16]],
  hood:  [['housing', 0.60], ['shop', 0.26], ['park', 0.14]],
  hood2: [['housing', 0.58], ['midrise', 0.18], ['shop', 0.14], ['park', 0.10]],
  old:   [['housing', 0.44], ['shop', 0.34], ['midrise', 0.12], ['park', 0.10]]
};
function weightedType(rng, dist) {
  const w = DISTRICT_WEIGHTS[dist];
  let r = rng();
  for (const [k, p] of w) { r -= p; if (r <= 0) return k; }
  return w[0][0];
}

/* ---- 충돌 격자 (셀 40m) ---- */
const COLL_CELL = 40;
function colliderKey(x, z) { return ((Math.floor(x / COLL_CELL)) * 8191 + Math.floor(z / COLL_CELL)); }
function addCollider(b) {
  const i0 = Math.floor(b.x0 / COLL_CELL), i1 = Math.floor(b.x1 / COLL_CELL);
  const j0 = Math.floor(b.z0 / COLL_CELL), j1 = Math.floor(b.z1 / COLL_CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = i * 8191 + j;
    let arr = CITYDATA.colliderGrid.get(k);
    if (!arr) { arr = []; CITYDATA.colliderGrid.set(k, arr); }
    arr.push(b);
  }
}
function queryColliders(x, z, r) {
  const out = [];
  const i0 = Math.floor((x - r) / COLL_CELL), i1 = Math.floor((x + r) / COLL_CELL);
  const j0 = Math.floor((z - r) / COLL_CELL), j1 = Math.floor((z + r) / COLL_CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const arr = CITYDATA.colliderGrid.get(i * 8191 + j);
    if (arr) for (const b of arr) if (out.indexOf(b) < 0) out.push(b);
  }
  return out;
}

/* ---- 보행 표면(플랫폼/램프) ---- */
const walkSurfaces = [];
function addSurface(s) { walkSurfaces.push(s); }
function groundAt(x, z, feetY) {
  let best = 0;
  const sh = surfaceHeight(x, z, feetY);
  if (sh <= feetY + 0.8 && sh > best) best = sh;
  for (let i = 0; i < walkSurfaces.length; i++) {
    const s = walkSurfaces[i];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    let top;
    if (s.ramp) {
      const t = s.axis === 'x' ? (x - s.x0) / Math.max(0.001, s.x1 - s.x0) : (z - s.z0) / Math.max(0.001, s.z1 - s.z0);
      top = lerp(s.y0, s.y1, clamp(t, 0, 1));
    } else top = s.top;
    if (top <= feetY + 0.8 && top > best) best = top;
  }
  return best;
}

/* ---- 도로 표면 높이 (차량용): 고가도로 / 다리 ---- */
function expresswayHeight(x) {
  const westStart = -CITY.HALF + 40, westEnd = -CITY.HALF + 210;
  const eastStart = CITY.HALF - 210, eastEnd = CITY.HALF - 40;
  if (x < westStart || x > eastEnd) return 0;
  if (x < westEnd) { const t = (x - westStart) / (westEnd - westStart); return lerp(0.2, CITY.EXPR_H, t); }
  if (x > eastStart) { const t = (eastEnd - x) / (eastEnd - eastStart); return lerp(0.2, CITY.EXPR_H, t); }
  return CITY.EXPR_H;
}
function bridgeHeight(bx, z) {
  const dz = Math.abs(z);
  if (dz <= 67) return CITY.BRIDGE_H;
  const rampEnd = 168;
  if (dz <= rampEnd) {
    const t = (rampEnd - dz) / (rampEnd - 67);
    return lerp(0.2, CITY.BRIDGE_H, clamp(t, 0, 1));
  }
  return 0;
}
/* ---- 도로 표면 높이 (고가도로 / 다리).
   curY 보다 높은 구조물은 밟지 못한다(지하 도로·다리 밑을 걸어다닐 수 있게). ---- */
function surfaceHeight(x, z, curY) {
  const base = curY === undefined ? 0 : curY;
  let h = 0;
  if (Math.abs(z - CITY.EXPR_Z) < CITY.EXPRESS_W / 2 + 1) {
    const e = expresswayHeight(x);
    if (e <= base + 1.6 && e > h) h = e;
  }
  for (const bx of CITY.BRIDGE_X) {
    if (Math.abs(x - bx) < 15) {
      const b = bridgeHeight(bx, z);
      if (b <= base + 1.6 && b > h) h = b;
    }
  }
  return h;
}

/* =========================================================
   메시 빌더 (병합 지오메트리)
   정점 색상은 sRGB 로 기술하고 선형 공간으로 변환해 저장한다.
   ========================================================= */
function MeshBuilder() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
MeshBuilder.prototype.quad = function (a, b, c, d, color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const base = this.pos.length / 3;
  const pts = [a, b, c, d];
  const r = Math.pow(color[0], 2.2), g = Math.pow(color[1], 2.2), bl = Math.pow(color[2], 2.2);
  for (const p of pts) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(nx, ny, nz);
    this.col.push(r, g, bl);
  }
  this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
};
MeshBuilder.prototype.box = function (cx, cy, cz, w, h, d, color) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
  this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
  this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
  this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
  this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color);
  this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
};
MeshBuilder.prototype.build = function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  g.setIndex(this.idx);
  g.computeBoundingSphere();
  return g;
};

/* =========================================================
   도시 생성
   ========================================================= */
function generateCity(seed) {
  const rng = mulberry32(seed);
  const D = CITYDATA;
  D.blocks.length = 0; D.buildings.length = 0; D.signs.length = 0; D.stores.length = 0;
  D.streetlights.length = 0; D.trees.length = 0; D.props.length = 0; D.parked.length = 0;
  D.colliderGrid.clear();
  walkSurfaces.length = 0;

  const styleKeys = FACADE_STYLES.map(s => s.key);

  for (let j = 0; j < CITY.GRID; j++) {
    for (let i = 0; i < CITY.GRID; i++) {
      const dist = districtProfile(i, j);
      const r = cellRect(i, j);
      const brng = mulberry32((seed ^ (i * 73856093) ^ (j * 19349663)) >>> 0);
      if (dist === 'river') {
        D.blocks.push({ i, j, type: 'river', dist, name: '한강', x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, buildings: [] });
        continue;
      }
      if (dist === 'sky') {
        D.blocks.push({ i, j, type: 'sky', dist, name: DIST_NAMES[(i + j) % DIST_NAMES.length], x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, buildings: [] });
        continue;
      }
      const type = weightedType(brng, dist);
      const block = {
        i, j, type, dist,
        name: DIST_NAMES[(i * 3 + j * 5) % DIST_NAMES.length],
        x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1,
        buildings: [], style: styleKeys[Math.floor(brng() * styleKeys.length)],
        tint: 0.82 + brng() * 0.36
      };
      D.blocks.push(block);
      buildBlock(block, brng, styleKeys);
    }
  }

  // 옥상 코스 구역 (해당 블록은 비워둠)
  buildSkyCourse();

  // 도로/보행 infrastruct
  buildRoadNetwork(rng);
  buildStreetFurniture(rng);
  buildTrafficGraph();
}

function pushBuilding(x, z, w, d, h, style, tint, extra) {
  const b = Object.assign({ x, z, w, d, h, style, tint, podium: null }, extra || {});
  CITYDATA.buildings.push(b);
  return b;
}

function buildBlock(block, rng, styleKeys) {
  const D = CITYDATA;
  const r = { x0: block.x0, z0: block.z0, x1: block.x1, z1: block.z1 };
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const bw = r.x1 - r.x0, bd = r.z1 - r.z0;

  const styleFor = () => styleKeys[Math.floor(rng() * styleKeys.length)];

  if (block.type === 'tower') {
    const n = 1 + Math.floor(rng() * 3);
    for (let t = 0; t < n; t++) {
      const w = randRange(rng, 15, 25), d = randRange(rng, 15, 25);
      const ox = randRange(rng, -bw / 2 + w / 2 + 2, bw / 2 - w / 2 - 2);
      const oz = randRange(rng, -bd / 2 + d / 2 + 2, bd / 2 - d / 2 - 2);
      const coreBoost = 1 - Math.min(1, Math.hypot(cx, cz) / 700);
      const h = randRange(rng, 34, 78) + coreBoost * randRange(rng, 10, 55);
      const st = rng() < 0.55 ? 'glass' : styleFor();
      const b = pushBuilding(cx + ox, cz + oz, w, d, h, st, 0.85 + rng() * 0.4);
      // podium
      if (rng() < 0.7) { b.podium = { w: w + randRange(rng, 5, 10), d: d + randRange(rng, 5, 10), h: randRange(rng, 5, 9) }; }
      D.props.push({ kind: 'tank', x: b.x + randRange(rng, -w / 4, w / 4), y: h, z: b.z + randRange(rng, -d / 4, d / 4), rot: rng() * TAU, s: randRange(rng, 0.9, 1.5) });
      for (let a = 0; a < 3; a++) D.props.push({ kind: 'ac', x: b.x + randRange(rng, -w / 3, w / 3), y: h, z: b.z + randRange(rng, -d / 3, d / 3), rot: rng() * TAU, s: randRange(rng, 0.8, 1.6) });
    }
  } else if (block.type === 'midrise') {
    const n = 2 + Math.floor(rng() * 3);
    for (let t = 0; t < n; t++) {
      const w = randRange(rng, 13, 22), d = randRange(rng, 13, 22);
      const ox = randRange(rng, -bw / 2 + w / 2 + 2, bw / 2 - w / 2 - 2);
      const oz = randRange(rng, -bd / 2 + d / 2 + 2, bd / 2 - d / 2 - 2);
      const h = randRange(rng, 11, 30);
      pushBuilding(cx + ox, cz + oz, w, d, h, rng() < 0.4 ? 'office' : styleFor(), 0.85 + rng() * 0.35);
      if (rng() < 0.5) D.props.push({ kind: 'tank', x: cx + ox + randRange(rng, -3, 3), y: h, z: cz + oz + randRange(rng, -3, 3), rot: rng() * TAU, s: 1 });
    }
  } else if (block.type === 'housing') {
    // 골목 주택가: 작은 집 + 좁은 골목
    const gx = 2 + Math.floor(rng() * 2), gz = 2 + Math.floor(rng() * 2);
    const cw = bw / gx, cd = bd / gz;
    for (let a = 0; a < gx; a++) {
      for (let b = 0; b < gz; b++) {
        if (rng() < 0.16) continue; // 빈 땅(주차장/마당)
        const lotW = cw - randRange(rng, 4, 7), lotD = cd - randRange(rng, 4, 7);
        const h = randRange(rng, 6, 13);
        const lx = r.x0 + cw * (a + 0.5) + randRange(rng, -1, 1);
        const lz = r.z0 + cd * (b + 0.5) + randRange(rng, -1, 1);
        pushBuilding(lx, lz, lotW, lotD, h, rng() < 0.5 ? 'brick' : 'apt', 0.82 + rng() * 0.4);
        if (rng() < 0.5) D.props.push({ kind: 'tank', x: lx, y: h, z: lz, rot: rng() * TAU, s: 0.8 });
        if (rng() < 0.22) {
          const tile = Math.floor(rng() * 64);
          const sc = randRange(rng, 1.6, 2.4);
          const f = streetFacing(lx, lz, lotW, lotD);
          D.signs.push({ x: f.x, y: Math.min(randRange(rng, 3.2, Math.max(3.6, h - 1.2)), h - sc * 0.55), z: f.z, rot: f.rot, tile, scale: sc });
        }
      }
    }
  } else if (block.type === 'shop') {
    // 상가/편의점 — 블록 가장자리(도로-facing)에 상가 줄
    const faceNorth = rng() < 0.5;
    const cnt = 2 + Math.floor(rng() * 4);
    let cursor = r.x0 + 1.5;
    for (let t = 0; t < cnt && cursor < r.x1 - 6; t++) {
      const w = randRange(rng, 9, 17);
      const d = randRange(rng, 9, 14);
      const h = randRange(rng, 6, 17);
      const x = cursor + w / 2;
      const z = faceNorth ? r.z0 + d / 2 + 1.5 : r.z1 - d / 2 - 1.5;
      pushBuilding(x, z, w, d, h, 'shop', 0.9 + rng() * 0.3);
      if (rng() < 0.75) D.stores.push({ x, y: 2.4, z: faceNorth ? r.z0 + 0.1 : r.z1 - 0.1, rot: faceNorth ? Math.PI : 0, tile: Math.floor(rng() * 8), scale: Math.min(w * 0.9, 12) });
      for (let s = 0; s < 1 + Math.floor(rng() * 2); s++) {
        const sc = randRange(rng, 1.8, 3.0);
        D.signs.push({
          x: x + randRange(rng, -w / 3, w / 3),
          y: Math.min(randRange(rng, 3.4, Math.max(3.8, h - 0.8)), h - sc * 0.55),
          z: faceNorth ? r.z0 + 0.3 : r.z1 - 0.3, rot: faceNorth ? Math.PI : 0, tile: Math.floor(rng() * 64), scale: sc
        });
      }
      cursor += w + randRange(rng, 0.6, 2.4);
    }
    // 남은 공간: 주차장 + 작은 매점
    if (rng() < 0.55) {
      const px = randRange(rng, r.x0 + 4, r.x1 - 4), pz = faceNorth ? randRange(rng, r.z0 + 18, r.z1 - 4) : randRange(rng, r.z0 + 4, r.z1 - 18);
      for (let c = 0; c < 2 + Math.floor(rng() * 3); c++) D.parked.push({ x: px + randRange(rng, -6, 6), z: pz + randRange(rng, -5, 5), rot: 0, color: Math.floor(rng() * 6) });
    }
  } else if (block.type === 'park') {
    const n = 6 + Math.floor(rng() * 10);
    for (let t = 0; t < n; t++) {
      D.trees.push({ x: randRange(rng, r.x0 + 3, r.x1 - 3), z: randRange(rng, r.z0 + 3, r.z1 - 3), s: randRange(rng, 0.8, 1.7), rot: rng() * TAU });
    }
    D.props.push({ kind: 'fountain', x: cx, y: 0, z: cz, rot: 0, s: 1 });
  } else if (block.type === 'plaza') {
    D.props.push({ kind: 'statue', x: cx, y: 0, z: cz, rot: rng() * TAU, s: 1 });
    for (let t = 0; t < 4; t++) D.trees.push({ x: randRange(rng, r.x0 + 5, r.x1 - 5), z: randRange(rng, r.z0 + 5, r.z1 - 5), s: randRange(rng, 0.9, 1.4), rot: rng() * TAU });
  }

  // 블록 외곽 충돌 등록 (포디움 포함)
  for (const b of D.buildings) {
    if (b.x < block.x0 - 1 || b.x > block.x1 + 1 || b.z < block.z0 - 1 || b.z > block.z1 + 1) continue;
    const pod = b.podium ? { x0: b.x - b.podium.w / 2, z0: b.z - b.podium.d / 2, x1: b.x + b.podium.w / 2, z1: b.z + b.podium.d / 2, h: b.podium.h } : null;
    if (pod) addCollider(pod);
    addCollider({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2, h: b.h });
  }
}

/* ---------------- 옥상(스카이) 코스 ----------------
   나선형 고가 코스: 지면 램프 → 평평한 발판 → 경사 램프 → ... (체크포인트 7개) */
function buildSkyCourse() {
  const c = CITYDATA.skyCourse;
  c.platforms.length = 0; c.checkpoints.length = 0;
  const cx = 76, cz = 215;               // 하늘 구역 블록(i 7~8, j 9~10) 중앙
  const PW = 18, PD = 16;
  const nodes = [
    { x: cx - 30, z: cz - 24, y: 1.5 },
    { x: cx + 4, z: cz - 24, y: 6.0 },
    { x: cx + 4, z: cz + 10, y: 10.5 },
    { x: cx - 30, z: cz + 10, y: 15.0 },
    { x: cx - 30, z: cz + 44, y: 19.5 },
    { x: cx + 4, z: cz + 44, y: 24.0 },
    { x: cx + 4, z: cz + 78, y: 28.0 }
  ];
  const plats = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const p = { x: n.x, z: n.z, w: PW, d: PD, y: n.y, h: n.y, top: n.y, base: 0 };
    p.x0 = p.x - p.w / 2; p.x1 = p.x + p.w / 2;
    p.z0 = p.z - p.d / 2; p.z1 = p.z + p.d / 2;
    plats.push(p);
    c.platforms.push(p);
    addSurface({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, top: p.y });
    c.checkpoints.push({ x: p.x, y: p.y + 2.2, z: p.z, idx: i, passed: false });
  }
  // 지면 -> 1단 램프
  const g = plats[0];
  const startRamp = {
    ramp: true, axis: 'z',
    x0: g.x0, x1: g.x1, z0: g.z0 - 12, z1: g.z0,
    y0: 0, y1: g.y
  };
  addSurface(startRamp); c.platforms.push(startRamp);
  // 단 사이 램프
  for (let i = 0; i < plats.length - 1; i++) {
    const a = plats[i], b = plats[i + 1];
    let s;
    if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) {
      const x0 = Math.min(a.x1, b.x1), x1 = Math.max(a.x0, b.x0);
      s = { ramp: true, axis: 'x', x0: x0, x1: x1, z0: a.z - a.d / 2, z1: a.z + a.d / 2, y0: a.y, y1: b.y };
    } else {
      const z0 = Math.min(a.z1, b.z1), z1 = Math.max(a.z0, b.z0);
      s = { ramp: true, axis: 'z', x0: a.x - a.w / 2, x1: a.x + a.w / 2, z0: z0, z1: z1, y0: a.y, y1: b.y };
    }
    addSurface(s); c.platforms.push(s);
  }
  c.start = { x: g.x, z: g.z0 - 20 };
}

/* ---------------- 도로 네트워크 ---------------- */
function buildRoadNetwork(rng) {
  // 도로 메시는 렌더 단계에서 만든다 (worldBuildMeshes)
  // 주차 차량
  for (let k = 0; k < CITY.GRID; k++) {
    for (let t = 0; t < 4; t++) {
      if (rng() < 0.55) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const z = roadZ(k) + side * 6;
      CITYDATA.parked.push({ x: randRange(rng, -CITY.HALF + 30, CITY.HALF - 30), z, rot: 0, color: Math.floor(rng() * 6) });
    }
  }
}

/* ---------------- 가로등 / 소품 ---------------- */
function buildStreetFurniture(rng) {
  const D = CITYDATA;
  for (let k = 0; k <= CITY.GRID; k++) {
    // 수직 도로
    const x = roadX(k);
    for (let z = -CITY.HALF + 20; z < CITY.HALF - 20; z += 38) {
      if (z > CITY.RIVER_Z0 - 6 && z < CITY.RIVER_Z1 + 6) continue;
      D.streetlights.push({ x: x - 9.3, z, rot: Math.PI / 2 });
      D.streetlights.push({ x: x + 9.3, z: z + 19, rot: -Math.PI / 2 });
    }
    // 수평 도로
    const z = roadZ(k);
    for (let x = -CITY.HALF + 24; x < CITY.HALF - 24; x += 40) {
      if (z > CITY.RIVER_Z0 - 4 && z < CITY.RIVER_Z1 + 4) continue;
      D.streetlights.push({ x, z: z - 9.3, rot: 0 });
      D.streetlights.push({ x: x + 20, z: z + 9.3, rot: Math.PI });
    }
  }
}

/* ---------------- 교통 그래프 ---------------- */
function buildTrafficGraph() {
  const D = CITYDATA;
  D.nodes.length = 0; D.edges.length = 0;
  const index = new Map();
  for (let l = 0; l <= CITY.GRID; l++) {
    for (let k = 0; k <= CITY.GRID; k++) {
      const isBank = (l === 6 || l === 7);
      const x = roadX(k), z = roadZ(l);
      index.set(k + ',' + l, D.nodes.length);
      D.nodes.push({ k, l, x, z, edges: [], bank: isBank });
    }
  }
  const addEdge = (a, b, axis, dir) => {
    const e = { a, b, axis, dir, len: 0 };
    e.len = Math.hypot(D.nodes[b].x - D.nodes[a].x, D.nodes[b].z - D.nodes[a].z);
    D.edges.push(e);
    D.nodes[a].edges.push({ edge: e, dir: 1, to: b });
    D.nodes[b].edges.push({ edge: e, dir: -1, to: a });
  };
  for (let l = 0; l <= CITY.GRID; l++) {
    for (let k = 0; k <= CITY.GRID; k++) {
      const a = index.get(k + ',' + l);
      if (k < CITY.GRID) {
        // 수평 간선
        addEdge(a, index.get((k + 1) + ',' + l), 'x', 1);
      }
      if (l < CITY.GRID) {
        const crossing = (l === 6); // 6->7 구간은 강을 건너는 구간
        const isBridge = crossing && (k === 4 || k === 11);
        if (!crossing || isBridge) addEdge(a, index.get(k + ',' + (l + 1)), 'z', 1);
      }
    }
  }
  D.nodeIndex = index;
}

/* 신호등 상태 (0=NS 진행, 1=NS 황색, 2=EW 진행, 3=EW 황색) */
function lightPhase(t) { const c = t % 36; return c < 15 ? 0 : c < 17 ? 1 : c < 32 ? 2 : 3; }
function lightGreenFor(axis, t) {
  const p = lightPhase(t);
  if (axis === 'z') return p === 0;
  return p === 2;
}
