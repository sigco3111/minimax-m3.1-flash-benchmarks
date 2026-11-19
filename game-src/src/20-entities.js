/* =========================================================
   한강시 — 개체 (플레이어 / 차량 / 보행자 / 경찰) 와 시뮬레이션
   ========================================================= */

const CAR_COLORS = ['#c8452f', '#2f5dc8', '#d9a227', '#3aa88a', '#8c4fd9', '#dcd6c8', '#3c4148', '#e0623a'];
const CAR_W = 2.05, CAR_L = 4.6;

/* ---------------- 입력 ---------------- */
const INPUT = { keys: Object.create(null), down: Object.create(null) };
const KEY_ACTIONS = {
  'w': 'fwd', 'arrowup': 'fwd',
  's': 'back', 'arrowdown': 'back',
  'a': 'left', 'arrowleft': 'left',
  'd': 'right', 'arrowright': 'right',
  'shift': 'boost', ' ': 'jump', 'f': 'use', 'e': 'violation', 'r': 'hide',
  'c': 'camera', 'm': 'map', 'escape': 'escape'
};
function inputHeld(action) { return !!INPUT.down[action]; }

/* ---------------- 상태 ---------------- */
const PLAYER = {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0,
  yaw: 0, onGround: true, car: null, hidden: false, hiddenT: 0,
  phase: 0, speed: 0, radius: 0.42, inCarSpeed: 0, jumpQueued: false, spinT: 0
};
const CARS = [];
const PEDS = [];
const GAME = {
  time: 0, wanted: 0, mission: null, completed: [], elapsed: 0,
  fps: 0, notice: '', noticeT: 0, toast: '', toastT: 0,
  policeLostT: 0, wantedT: 0, target: null, missionData: null,
  simRng: mulberry32(20241115), shake: 0, nitro: 1, night: 0
};

function makeCar(x, z, yaw, colorIdx, kind) {
  return {
    x, z, y: 0, yaw, vx: 0, vz: 0, long: 0, lat: 0,
    steer: 0, throttle: 0, brake: 0, hand: 0,
    color: CAR_COLORS[colorIdx % CAR_COLORS.length], kind: kind || 'sedan',
    ai: null, static: true, radius: 2.0, wheelSpin: 0, pitch: 0, roll: 0, brakeLight: 0
  };
}

/* =========================================================
   충돌
   ========================================================= */
function resolveCircleBox(px, pz, r, boxes) {
  let pushX = 0, pushZ = 0, hit = false;
  for (const b of boxes) {
    const cx = clamp(px, b.x0, b.x1), cz = clamp(pz, b.z0, b.z1);
    let dx = px - cx, dz = pz - cz;
    let d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pushX += (dx / d) * (r - d);
      pushZ += (dz / d) * (r - d);
    } else {
      // 중심이 박스 안: 최소 축으로 밀어냄
      const dl = px - b.x0, dr = b.x1 - px, db = pz - b.z0, df = b.z1 - pz;
      const m = Math.min(dl, dr, db, df);
      if (m === dl) { pushX -= (r + dl); }
      else if (m === dr) { pushX += (r + dr); }
      else if (m === db) { pushZ -= (r + db); }
      else { pushZ += (r + df); }
    }
  }
  return { x: pushX, z: pushZ, hit };
}

/* 차량이 밟는 지면(고가도로/다리) — 현재 높이를 기준으로 구조물을 고른다 */
function carGroundHeight(x, z, curY) {
  return surfaceHeight(x, z, curY === undefined ? 0 : curY);
}

/* =========================================================
   차량 물리 (아케이드)
   ========================================================= */
function stepCarPhysics(car, dt) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const rx = -fz, rz = fx;
  let vLong = car.vx * fx + car.vz * fz;
  let vLat = car.vx * rx + car.vz * rz;

  // 엔진 / 브레이크
  const accel = car.kind === 'truck' ? 11 : car.kind === 'taxi' ? 17 : 15;
  const maxSpeed = car.kind === 'truck' ? 26 : 33;
  if (car.throttle > 0) {
    const falloff = 1 - clamp(vLong / maxSpeed, 0, 1) * 0.82;
    vLong += car.throttle * accel * falloff * dt;
  }
  if (car.brake > 0) {
    if (vLong > 0.4) vLong -= car.brake * 26 * dt;
    else if (vLong > -12) vLong -= car.brake * 11 * dt;
  }
  // 저항
  vLong -= vLong * (0.22 + Math.abs(vLong) * 0.012) * dt;

  // 횡방향 마찰(그립) — 핸드브레이크 시 약해져 드리프트가 생긴다
  let grip = 9.5;
  if (car.hand > 0) grip = 1.7;
  else if (car.kind === 'truck') grip = 7.0;
  if (Math.abs(vLat) > 0.8) grip *= 0.6;
  vLat *= Math.exp(-grip * dt);

  // 속도 벡터는 "현재 진행 방향" 기준으로 재구성한다.
  // 조향으로 차체가 회전한 뒤 속도 방향이 그립으로 따라오는 구조 → 스_pin 후 슬립 발생
  car.vx = fx * vLong + rx * vLat;
  car.vz = fz * vLong + rz * vLat;
  car.long = vLong; car.lat = vLat;

  // 회전 (속도 방향과 독립 → 그립이 없으면 미끄러진다)
  const speedAbs = Math.abs(vLong);
  const steerAuth = clamp(speedAbs / 5, 0, 1) * (1 - clamp(speedAbs / (maxSpeed * 1.25), 0, 0.55)) * (car.hand > 0 ? 1.35 : 1);
  const dirSign = vLong >= -0.2 ? 1 : -1;
  car.yaw += car.steer * steerAuth * 2.2 * dirSign * dt;

  // 위치
  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // 강은 차로도 건널 수 없다(다리 위일 때만)
  if (car.z > CITY.RIVER_Z0 && car.z < CITY.RIVER_Z1 && car.y < CITY.BRIDGE_H - 1.5) {
    car.z = (car.z - CITY.RIVER_Z0) < (CITY.RIVER_Z1 - car.z) ? CITY.RIVER_Z0 - 1.2 : CITY.RIVER_Z1 + 1.2;
    car.vz *= -0.2;
  }

  // 건물 충돌 (반동)
  const boxes = queryColliders(car.x, car.z, car.radius + 2);
  const res = resolveCircleBox(car.x, car.z, car.radius, boxes);
  if (res.hit) {
    car.x += res.x; car.z += res.z;
    const nLen = Math.hypot(res.x, res.z) || 1;
    const nx = res.x / nLen, nz = res.z / nLen;
    const vn = car.vx * nx + car.vz * nz;
    if (vn < 0) {
      car.vx -= vn * 1.35 * nx;
      car.vz -= vn * 1.35 * nz;
    }
    car.vx *= 0.55; car.vz *= 0.55;
    car.long *= 0.55; car.lat *= 0.55;
    car.shakeT = Math.min(1, car.shakeT + Math.abs(vn) * 0.06);
  }
  // 차량 간 충돌
  for (const o of CEDS_NEAR) {
    if (o === car) continue;
    const dx = car.x - o.x, dz = car.z - o.z;
    const d = Math.hypot(dx, dz);
    const minD = car.radius + o.radius;
    if (d < minD && d > 1e-4) {
      const nx = dx / d, nz = dz / d;
      const pen = (minD - d) * 0.5;
      car.x += nx * pen; car.z += nz * pen;
      o.x -= nx * pen; o.z -= nz * pen;
      const rvx = car.vx - o.vx, rvz = car.vz - o.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const imp = -vn * 0.62;
        car.vx += nx * imp; car.vz += nz * imp;
        o.vx -= nx * imp * 0.8; o.vz -= nz * imp * 0.8;
        car.shakeT = Math.min(1, car.shakeT + Math.abs(vn) * 0.05);
      }
    }
  }
  // 지면 높이 (고가도로/다리)
  const gy = carGroundHeight(car.x, car.z, car.y);
  car.y = damp(car.y, gy, 12, dt);

  // 고가 구조물(다리/고가도로) 난간 — 밖으로 떨어지지 않게 가둔다
  if (car.y > 2.5) {
    let clamped = false;
    if (Math.abs(car.z - CITY.EXPR_Z) < 14) {
      const lim = CITY.EXPRESS_W / 2 - 1.6;
      if (Math.abs(car.z - CITY.EXPR_Z) > lim) { car.z = CITY.EXPR_Z + Math.sign(car.z - CITY.EXPR_Z) * lim; clamped = true; }
    }
    for (const bx of CITY.BRIDGE_X) {
      if (Math.abs(car.x - bx) < 16) {
        const lim = 11.4;
        if (Math.abs(car.x - bx) > lim) { car.x = bx + Math.sign(car.x - bx) * lim; clamped = true; }
      }
    }
    if (clamped) { car.vx *= 0.4; car.vz *= 0.4; }
  }

  // 시각적 요동
  car.wheelSpin += car.long * dt * 2.2;
  car.pitch = damp(car.pitch, clamp(-car.long * 0.004 + (car.brake > 0 ? 0.03 : 0), -0.12, 0.12), 6, dt);
  car.roll = damp(car.roll, clamp(-car.lat * 0.02, -0.14, 0.14), 6, dt);
  car.brakeLight = damp(car.brakeLight, (car.brake > 0 || car.hand > 0) ? 1 : 0, 14, dt);
  car.shakeT = Math.max(0, (car.shakeT || 0) - dt * 2.2);
}

/* =========================================================
   AI 차량 (신호 준수 / 추격)
   ========================================================= */
function spawnTrafficCar(rng) {
  const D = CITYDATA;
  if (!D.edges.length) return null;
  const e = D.edges[Math.floor(rng() * D.edges.length)];
  const from = D.nodes[e.a], to = D.nodes[e.b];
  const t = rng();
  const car = makeCar(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, 0, Math.floor(rng() * CAR_COLORS.length), rng() < 0.3 ? 'taxi' : (rng() < 0.12 ? 'truck' : 'sedan'));
  car.ai = { edge: e, from: e.a, to: e.b, wait: 0, state: 'drive' };
  car.static = false;
  car.y = carGroundHeight(car.x, car.z);
  return car;
}
function laneOffsetFor(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  const fx = dx / l, fz = dz / l;
  const rx = -fz, rz = fx;
  return { x: rx * 4.6, z: rz * 4.6, fx, fz };
}
function stepTrafficAI(car, dt, t) {
  const D = CITYDATA;
  const ai = car.ai;
  const from = D.nodes[ai.from], to = D.nodes[ai.to];
  const off = laneOffsetFor(from.x, from.z, to.x, to.z);
  let dx = to.x + off.x - car.x, dz = to.z + off.z - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  dx /= dist; dz /= dist;

  // 추격 모드: 가까운 거리는 플레이어를 직선으로 추적
  const dPlayer = Math.hypot(PLAYER.x - car.x, PLAYER.z - car.z);
  let desired = Math.atan2(dx, dz);
  if (ai.pursue && dPlayer < 38) desired = Math.atan2(PLAYER.x - car.x, PLAYER.z - car.z);
  const diff = wrapAngle(desired - car.yaw);
  car.steer = clamp(diff * 1.9, -1, 1);

  // 신호 판정 (추격 중에는 무시)
  let mustStop = false;
  const axis = ai.edge.axis;
  const distToNode = Math.hypot(to.x - car.x, to.z - car.z);
  if (!ai.pursue && distToNode < 22 && !lightGreenFor(axis, t)) mustStop = true;
  // 앞 차량 감지
  const ahead = carForwardClear(car, 16);
  if (ahead < 12) mustStop = true;

  if (mustStop) {
    car.throttle = 0; car.brake = 0.8; car.hand = 0;
  } else {
    const targetSpeed = (ai.pursue ? 17 : 11) + (car.kind === 'truck' ? -2 : 0);
    if (car.long < targetSpeed) { car.throttle = 0.9; car.brake = 0; }
    else { car.throttle = 0; car.brake = 0.35; }
    car.hand = 0;
  }

  if (dist < 7) {
    // 다음 노드 선택
    const outs = to.edges.filter(e => e.to !== ai.from);
    const list = outs.length ? outs : to.edges;
    let pickEdge = null;
    if (ai.pursue) {
      // 플레이어 쪽으로 가장 가까워지는 간선을 선택
      let bd = Infinity;
      for (const e of list) {
        const n = D.nodes[e.to];
        const d = Math.hypot(n.x - PLAYER.x, n.z - PLAYER.z);
        if (d < bd) { bd = d; pickEdge = e; }
      }
    } else {
      pickEdge = list[Math.floor(GAME.simRng() * list.length) % list.length];
    }
    if (pickEdge) {
      ai.from = ai.to;
      ai.to = pickEdge.to;
      ai.edge = pickEdge.edge;
    }
  }
}
function carForwardClear(car, dist) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const boxes = queryColliders(car.x + fx * dist * 0.5, car.z + fz * dist * 0.5, dist * 0.5 + 3);
  let best = dist;
  for (const b of boxes) {
    const t = rayBox(car.x, car.y + 0.8, car.z, fx, 0, fz, b, dist);
    if (t < best) best = t;
  }
  for (const o of CEDS_NEAR) {
    if (o === car) continue;
    const rx = o.x - car.x, rz = o.z - car.z;
    const proj = rx * fx + rz * fz;
    if (proj < 0 || proj > best) continue;
    const perp = Math.abs(rx * fz - rz * fx);
    if (perp < 2.6) best = proj - 2.2;
  }
  return best;
}
function rayBox(ox, oy, oz, dx, dy, dz, b, maxD) {
  let tmin = 0, tmax = maxD;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [b.x0, 0, b.z0], hi = [b.x1, b.h, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-6) { if (o[i] < lo[i] || o[i] > hi[i]) return maxD; }
    else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return maxD;
    }
  }
  return tmin;
}

/* ---------------- 경찰 차량 ---------------- */
function spawnPoliceCar() {
  // 플레이어에서 45~140m 떨어진 도로 교차로에서 출발
  const nodes = CITYDATA.nodes;
  const cand = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const d = Math.hypot(n.x - PLAYER.x, n.z - PLAYER.z);
    if (d > 45 && d < 140 && n.edges.length) cand.push(i);
  }
  if (!cand.length) return null;
  const nodeIdx = cand[Math.floor(GAME.simRng() * cand.length) % cand.length];
  const node = nodes[nodeIdx];
  const e = node.edges[Math.floor(GAME.simRng() * node.edges.length)];
  const car = makeCar(node.x, node.z, 0, 5, 'police');
  car.police = true; car.static = false;
  car.color = '#eef2f8';
  car.ai = { edge: e.edge, from: e.to, to: nodeIdx, wait: 0, state: 'drive', pursue: true };
  car.y = surfaceHeight(car.x, car.z);
  return car;
}
function stepPoliceAI(car, dt) {
  stepTrafficAI(car, dt, GAME.time);
  // 시야 확보: 목표 근처에서 장애물 회피
  const d = Math.hypot(PLAYER.x - car.x, PLAYER.z - car.z);
  if (d < 30 && carForwardClear(car, 14) < 10) {
    let bestAng = Math.atan2(PLAYER.x - car.x, PLAYER.z - car.z), bestClear = -1;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0]) {
      const a = Math.atan2(PLAYER.x - car.x, PLAYER.z - car.z) + off;
      const c = rayClearAhead(car, a, 13);
      if (c > bestClear) { bestClear = c; bestAng = a; }
    }
    car.steer = clamp(wrapAngle(bestAng - car.yaw) * 2.2, -1, 1);
    car.throttle = 0.6; car.brake = 0;
  }
}
function rayClearAhead(car, ang, dist) {
  const fx = Math.sin(ang), fz = Math.cos(ang);
  const boxes = queryColliders(car.x + fx * dist * 0.5, car.z + fz * dist * 0.5, dist * 0.5 + 3);
  let best = dist;
  for (const b of boxes) {
    const t = rayBox(car.x, car.y + 0.8, car.z, fx, 0, fz, b, dist);
    if (t < best) best = t;
  }
  return best;
}

/* ---------------- 보행자 ---------------- */
function spawnPed(x, z) {
  const rng = GAME.simRng;
  const axis = rng() < 0.5 ? 'x' : 'z';
  const ped = {
    x, z, y: 0, yaw: rng() * TAU, axis, dir: rng() < 0.5 ? 1 : -1,
    speed: randRange(rng, 1.1, 1.8), phase: rng() * TAU, flee: 0, color: Math.floor(rng() * 6)
  };
  // 보도 라인에 스냅
  if (axis === 'x') { ped.line = roadZ(Math.floor((z + CITY.HALF) / CITY.TILE)) + (ped.dir > 0 ? 9.6 : -9.6); }
  else { ped.line = roadX(Math.floor((x + CITY.HALF) / CITY.TILE)) + (ped.dir > 0 ? -9.6 : 9.6); }
  return ped;
}
function stepPed(p, dt) {
  // 차량 회피
  let fleeX = 0, fleeZ = 0;
  for (const c of CEDS_NEAR) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 90) { const d = Math.sqrt(d2) || 1; fleeX += dx / d; fleeZ += dz / d; }
  }
  p.flee = damp(p.flee, (fleeX || fleeZ) ? 1 : 0, 6, dt);
  const sp = p.speed * (1 + p.flee * 2.4);
  if (p.axis === 'x') {
    p.x += p.dir * sp * dt;
    p.z = damp(p.z, p.line + fleeZ * 4, 6, dt);
    p.yaw = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    p.z += p.dir * sp * dt;
    p.x = damp(p.x, p.line + fleeX * 4, 6, dt);
    p.yaw = p.dir > 0 ? 0 : Math.PI;
  }
  p.phase += sp * dt * 3.4;
  // 경계에서 회전
  const lim = CITY.HALF - 14;
  if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) { p.axis = p.axis === 'x' ? 'z' : 'x'; p.dir = GAME.simRng() < 0.5 ? 1 : -1; }
  p.y = surfaceHeight(p.x, p.z);
}

/* =========================================================
   플레이어
   ========================================================= */
function playerCollide() {
  // 강은 걸어서 건널 수 없다(다리 위일 때만 통과)
  if (PLAYER.z > CITY.RIVER_Z0 && PLAYER.z < CITY.RIVER_Z1 && PLAYER.y < CITY.BRIDGE_H - 1.5) {
    PLAYER.z = (PLAYER.z - CITY.RIVER_Z0) < (CITY.RIVER_Z1 - PLAYER.z) ? CITY.RIVER_Z0 - 0.6 : CITY.RIVER_Z1 + 0.6;
    PLAYER.vz = 0;
  }
  const boxes = queryColliders(PLAYER.x, PLAYER.z, PLAYER.radius + 1);
  const res = resolveCircleBox(PLAYER.x, PLAYER.z, PLAYER.radius, boxes);
  if (res.hit) { PLAYER.x += res.x; PLAYER.z += res.z; }
}
function stepPlayer(dt) {
  if (PLAYER.car) {
    const car = PLAYER.car;
    // 운전 입력
    const fwd = inputHeld('fwd') ? 1 : 0;
    const back = inputHeld('back') ? 1 : 0;
    car.throttle = fwd;
    car.brake = back ? 1 : 0;
    car.hand = inputHeld('jump') ? 1 : 0;
    const steerIn = (inputHeld('left') ? 1 : 0) - (inputHeld('right') ? 1 : 0);
    car.steer = damp(car.steer, steerIn, 12, dt);
    if (inputHeld('boost') && GAME.nitro > 0.05 && fwd) {
      GAME.nitro = Math.max(0, GAME.nitro - dt * 0.34);
      car.throttle = 1;
    } else {
      GAME.nitro = Math.min(1, GAME.nitro + dt * 0.08);
    }
    stepCarPhysics(car, dt);
    PLAYER.x = car.x; PLAYER.y = car.y; PLAYER.z = car.z;
    PLAYER.yaw = car.yaw;
    PLAYER.speed = Math.abs(car.long) * 3.6;
    PLAYER.inCarSpeed = car.long;
    // 탑승 중에도 차량-보행자 충돌(비강력적 밀치기)
    return;
  }

  // 도보
  const camYaw = CAMERA.yaw;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const rx = -fz, rz = fx;
  let mx = 0, mz = 0;
  if (inputHeld('fwd')) { mx += fx; mz += fz; }
  if (inputHeld('back')) { mx -= fx; mz -= fz; }
  if (inputHeld('left')) { mx -= rx; mz -= rz; }
  if (inputHeld('right')) { mx += rx; mz += rz; }
  const run = inputHeld('boost');
  const maxSpd = run ? 7.4 : 3.5;
  const acc = run ? 46 : 34;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.001) {
    mx /= ml; mz /= ml;
    PLAYER.vx += mx * acc * dt;
    PLAYER.vz += mz * acc * dt;
    const sp = Math.hypot(PLAYER.vx, PLAYER.vz);
    if (sp > maxSpd) { PLAYER.vx = PLAYER.vx / sp * maxSpd; PLAYER.vz = PLAYER.vz / sp * maxSpd; }
    PLAYER.yaw = Math.atan2(mx, mz);
    PLAYER.phase += sp * dt * 2.4;
  } else {
    const damp2 = Math.exp(-13 * dt);
    PLAYER.vx *= damp2; PLAYER.vz *= damp2;
    PLAYER.phase += 2 * dt;
  }
  if (PLAYER.hidden && (mx || mz)) { PLAYER.hidden = false; PLAYER.hiddenT = 0; }

  PLAYER.x += PLAYER.vx * dt;
  PLAYER.z += PLAYER.vz * dt;
  playerCollide();

  // 중력 / 점프
  const gy = groundAt(PLAYER.x, PLAYER.z, PLAYER.y);
  if (PLAYER.onGround && (inputHeld('jump') || PLAYER.jumpQueued)) {
    PLAYER.vy = 7.4;
    PLAYER.onGround = false;
    PLAYER.jumpQueued = false;
  }
  PLAYER.jumpQueued = false;
  PLAYER.vy -= 24 * dt;
  PLAYER.y += PLAYER.vy * dt;
  if (PLAYER.y <= gy) {
    PLAYER.y = gy;
    PLAYER.vy = 0;
    PLAYER.onGround = true;
  } else if (PLAYER.y > gy + 0.02) {
    PLAYER.onGround = false;
  }
  PLAYER.speed = Math.hypot(PLAYER.vx, PLAYER.vz);
}

/* ---------------- 차량 승하차 ---------------- */
function nearestCar(maxDist) {
  let best = null, bd = maxDist;
  for (const c of CARS) {
    if (c === PLAYER.car) continue;
    const d = Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(car) {
  PLAYER.car = car;
  car.static = false;
  car.ai = null;
  PLAYER.vx = 0; PLAYER.vz = 0;
  setNotice(car.kind === 'taxi' ? '노을택시 탑승 — F 로 하차' : '차량 탑승 — F 로 하차');
}
function exitCar() {
  const car = PLAYER.car;
  if (!car) return;
  const rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
  PLAYER.x = car.x + rx * 3.0;
  PLAYER.z = car.z + rz * 3.0;
  PLAYER.y = groundAt(PLAYER.x, PLAYER.z, car.y + 1);
  PLAYER.vx = 0; PLAYER.vz = 0; PLAYER.vy = 0;
  car.throttle = 0; car.brake = 1; car.hand = 0;
  car.static = true;
  PLAYER.car = null;
  setNotice('하차 완료');
}
function toggleVehicle() {
  if (PLAYER.car) { exitCar(); return; }
  const c = nearestCar(5.0);
  if (c) enterCar(c);
  else setNotice('가까운 차량이 없습니다');
}

/* ---------------- 수배( wanted ) ---------------- */
function raiseWanted(amount) {
  const before = GAME.wanted;
  GAME.wanted = clamp(GAME.wanted + (amount === undefined ? 1 : amount), 0, 3);
  if (GAME.wanted !== before) {
    GAME.policeLostT = 0;
    GAME.wantedT = 0;
    setNotice('수배 레벨 ' + GAME.wanted + ' — 순찰대가 접근합니다');
  }
}
function lowerWanted() {
  if (GAME.wanted > 0) {
    GAME.wanted--;
    setNotice(GAME.wanted === 0 ? '수배 해제 — 순찰대가 돌아갑니다' : '수배 레벨 ' + GAME.wanted);
  }
}
function policeSeePlayer() {
  if (PLAYER.hidden) return false;
  for (const c of CARS) {
    if (!c.police) continue;
    const d = Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z);
    if (d > 62) continue;
    const dx = (PLAYER.x - c.x) / (d || 1), dz = (PLAYER.z - c.z) / (d || 1);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (dx * fx + dz * fz < -0.35) continue;      // 뒤쪽은 안 보임
    const hit = rayBox(c.x, c.y + 1.2, c.z, dx, 0, dz, { x0: c.x - 0.1, z0: c.z - 0.1, x1: c.x + 0.1, z1: c.z + 0.1, h: 0 }, 0.001);
    // 시야 차단 확인
    const boxes = queryColliders((c.x + PLAYER.x) / 2, (c.z + PLAYER.z) / 2, d / 2 + 2);
    let blocked = false;
    for (const b of boxes) {
      if (b.h < 1.5) continue;
      const t = rayBox(c.x, c.y + 1.2, c.z, dx, 0, dz, b, d);
      if (t < d - 1.0) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

/* =========================================================
   월드 초기화 (차량 / 보행자 배치)
   ========================================================= */
function spawnWorldEntities() {
  CARS.length = 0;
  PEDS.length = 0;
  const rng = GAME.simRng;
  // 주차 차량
  for (const p of CITYDATA.parked) {
    const c = makeCar(p.x, p.z, p.rot, p.color, 'sedan');
    c.static = true;
    c.y = surfaceHeight(c.x, c.z);
    CARS.push(c);
  }
  // AI 교통 차량
  for (let i = 0; i < 26; i++) {
    const c = spawnTrafficCar(rng);
    if (c) CARS.push(c);
  }
  // 플레이어 근처 보장 차량
  const playerCar = makeCar(PLAYER.x + 6, PLAYER.z + 4, 0, 0, 'sedan');
  playerCar.static = true;
  playerCar.y = surfaceHeight(playerCar.x, playerCar.z);
  CARS.push(playerCar);
  // 보행자
  for (let i = 0; i < 80; i++) {
    const p = spawnPed(randRange(rng, -CITY.HALF + 30, CITY.HALF - 30), randRange(rng, -CITY.HALF + 30, CITY.HALF - 30));
    PEDS.push(p);
  }
}
let CEDS_NEAR = [];
function refreshNearbyCars(px, pz) {
  CEDS_NEAR.length = 0;
  for (const c of CARS) {
    if (Math.hypot(c.x - px, c.z - pz) < 16) CEDS_NEAR.push(c);
  }
}

/* =========================================================
   시뮬레이션 스텝 (렌더링과 독립)
   ========================================================= */
function simulateStep(dt, t) {
  GAME.time = (GAME.time + dt) % 180;
  GAME.elapsed += dt;
  GAME.night = nightFactor(GAME.time);
  WORLD.night = GAME.night;
  const wt = GAME.time;

  // 근처 차량 목록 (차량 간 충돌/보행자 회피용)
  refreshNearbyCars(PLAYER.x, PLAYER.z);

  // 차량 AI
  for (const c of CARS) {
    if (c === PLAYER.car) continue;
    if (c.police) {
      stepPoliceAI(c, dt);
    } else if (c.ai) {
      stepTrafficAI(c, dt, wt);
    } else {
      c.throttle = 0; c.brake = 1; c.hand = 0; c.steer = 0;
    }
    // 멀리 있는 주차 차량은 물리 계산 생략
    if (c.static && !c.police && Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z) > 90) continue;
    stepCarPhysics(c, dt);
  }
  // 플레이어
  stepPlayer(dt);

  // 보행자
  for (const p of PEDS) stepPed(p, dt);

  // 수배/경찰 관리
  if (GAME.wanted > 0) {
    GAME.wantedT += dt;
    const seen = policeSeePlayer();
    let nearest = 1e9;
    for (const c of CARS) if (c.police) nearest = Math.min(nearest, Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z));
    // 순찰대가 도착할 시간(10초)을 준 뒤에야 "시야 상실"로 수배를 내린다
    if (GAME.wantedT > 10 && !seen && nearest > 45) GAME.policeLostT += dt;
    else GAME.policeLostT = 0;
    if (GAME.policeLostT > 5.0) { lowerWanted(); GAME.policeLostT = 0; }
    managePoliceCars(dt);
  } else {
    GAME.wantedT = 0;
    // 경찰 차량 회수
    for (let i = CARS.length - 1; i >= 0; i--) if (CARS[i].police) CARS.splice(i, 1);
  }
  if (PLAYER.hidden) {
    PLAYER.hiddenT += dt;
    if (PLAYER.hiddenT > 9) { PLAYER.hidden = false; PLAYER.hiddenT = 0; }
  }

  // 임무 갱신
  updateMission(dt);

  // HUD 알림 타이머
  if (GAME.noticeT > 0) GAME.noticeT -= dt;
  if (GAME.toastT > 0) GAME.toastT -= dt;
}
function managePoliceCars(dt) {
  let count = 0;
  for (const c of CARS) if (c.police) count++;
  const want = GAME.wanted;
  while (count < want) {
    const c = spawnPoliceCar();
    if (!c) break;
    CARS.push(c);
    count++;
  }
  // 너무 멀리 있는 순찰차는 회수
  for (let i = CARS.length - 1; i >= 0; i--) {
    const c = CARS[i];
    if (!c.police) continue;
    if (Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z) > 190) CARS.splice(i, 1);
  }
}

/* ---------------- 알림 ---------------- */
function setNotice(t) { GAME.notice = t; GAME.noticeT = 2.4; }
function setToast(t) { GAME.toast = t; GAME.toastT = 3.0; }
