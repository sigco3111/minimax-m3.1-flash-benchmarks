/* =========================================================
   한강시 — 카메라 / 렌더 / 입력 / 테스트 API
   ========================================================= */

const CAMERA = { yaw: 0, pitch: 0.26, dist: 7.6, curDist: 7.6, x: 0, y: 4, z: -10, lx: 0, ly: 0, lz: 0, mouseIdle: 0, shake: 0 };
const FIXED = 1 / 60;

let renderer, scene, camera3;
let CHAR = null, charShadow = null;
let carParts = null, pedParts = null;
let missionPanelOpen = false;

/* ---------------- 시각 오브젝트 ---------------- */
function buildCharacter() {
  const g = new THREE.Group();
  const jacket = flatMaterial(0x2f7f86, 0.65, 0.05);
  const skin = flatMaterial(0xe8c39a, 0.85, 0.0);
  const pants = flatMaterial(0x2b3140, 0.85, 0.0);
  const shoe = flatMaterial(0x1b1f28, 0.9, 0.0);
  const mk = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
  const torso = mk(0.54, 0.82, 0.30, jacket); torso.position.y = 1.14;
  const head = mk(0.32, 0.32, 0.32, skin); head.position.y = 1.72;
  const hair = mk(0.34, 0.10, 0.34, flatMaterial(0x241c18, 0.9)); hair.position.y = 1.90;
  const armL = mk(0.15, 0.60, 0.16, jacket); armL.position.set(-0.36, 1.16, 0);
  const armR = mk(0.15, 0.60, 0.16, jacket); armR.position.set(0.36, 1.16, 0);
  const legL = mk(0.19, 0.80, 0.22, pants); legL.position.set(-0.13, 0.44, 0);
  const legR = mk(0.19, 0.80, 0.22, pants); legR.position.set(0.13, 0.44, 0);
  const shoeL = mk(0.20, 0.10, 0.28, shoe); shoeL.position.set(-0.13, 0.05, 0.04);
  const shoeR = mk(0.20, 0.10, 0.28, shoe); shoeR.position.set(0.13, 0.05, 0.04);
  g.add(torso, head, hair, armL, armR, legL, legR, shoeL, shoeR);
  CHAR = { group: g, torso, head, armL, armR, legL, legR };
  scene.add(g);

  // 그림자 데칼
  const shTex = canvasTex(makeGlowTexture(), { srgb: false });
  charShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: shTex, color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  charShadow.rotation.x = -Math.PI / 2;
  scene.add(charShadow);
}

function buildVehicleParts() {
  const maxCars = 240;
  const bodyMat = flatMaterial(0xffffff, 0.35, 0.35);
  const cabinMat = flatMaterial(0x1b2230, 0.15, 0.2);
  const wheelMat = flatMaterial(0x14161a, 0.9, 0.0);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.30, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, emissive: 0xfff0c8, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8e1f1f, emissive: 0xff2a2a, emissiveIntensity: 0.5, roughness: 0.4 });
  carParts = {
    body: InstancedPool(new THREE.BoxGeometry(1, 1, 1), bodyMat, maxCars, true),
    cabin: InstancedPool(new THREE.BoxGeometry(1, 1, 1), cabinMat, maxCars, true),
    wheel: InstancedPool(wheelGeo, wheelMat, maxCars * 4, false),
    head: InstancedPool(new THREE.BoxGeometry(1, 1, 1), headMat, maxCars * 2, false),
    tail: InstancedPool(new THREE.BoxGeometry(1, 1, 1), tailMat, maxCars * 2, false)
  };
  carParts.head.material.emissiveIntensity = 0.15;
  for (const k in carParts) scene.add(carParts[k]);
}

function buildPedParts() {
  const maxP = 90;
  pedParts = {
    body: InstancedPool(new THREE.CapsuleGeometry(0.24, 0.72, 4, 8), flatMaterial(0xffffff, 0.9, 0), maxP, false),
    head: InstancedPool(new THREE.SphereGeometry(0.17, 10, 8), flatMaterial(0xe8c39a, 0.9, 0), maxP, false)
  };
  for (const k in pedParts) scene.add(pedParts[k]);
}

/* ---------------- 카메라 ---------------- */
function updateCamera(dt) {
  // 차량 주행 중에는 마우스 조작이 없으면 시선이 천천히 차량을 따라간다
  CAMERA.mouseIdle += dt;
  if (PLAYER.car && CAMERA.mouseIdle > 1.2) {
    CAMERA.yaw = approachAngle(CAMERA.yaw, PLAYER.car.yaw, 1.4 * dt);
  }
  const cp = Math.cos(CAMERA.pitch), sp = Math.sin(CAMERA.pitch);
  const fx = Math.sin(CAMERA.yaw), fz = Math.cos(CAMERA.yaw);
  const tx = PLAYER.x, tz = PLAYER.z;
  const ty = PLAYER.y + 1.55 + (PLAYER.car ? 0.45 : 0);
  const dirX = -fx * cp, dirY = sp, dirZ = -fz * cp;
  let maxD = CAMERA.dist;
  const boxes = queryColliders(tx + dirX * CAMERA.dist * 0.5, tz + dirZ * CAMERA.dist * 0.5, CAMERA.dist * 0.5 + 2);
  for (const b of boxes) {
    const t = rayBox(tx, ty, tz, dirX, dirY, dirZ, b, CAMERA.dist);
    if (t < maxD) maxD = Math.max(1.6, t - 0.45);
  }
  // 지면 아래로 내려가지 않게
  const gy = surfaceHeight(tx + dirX * maxD * 0.5, tz + dirZ * maxD * 0.5);
  if (ty + dirY * maxD < gy + 0.9) maxD = Math.max(1.6, (gy + 0.9 - ty) / Math.max(0.15, dirY));
  CAMERA.curDist = damp(CAMERA.curDist, maxD, 14, dt);
  const shakeAmt = (PLAYER.car && PLAYER.car.shakeT ? PLAYER.car.shakeT : 0) * 0.35;
  const sx = (GAME.simRng() - 0.5) * shakeAmt, sy = (GAME.simRng() - 0.5) * shakeAmt;
  CAMERA.x = tx + dirX * CAMERA.curDist + sx;
  CAMERA.y = ty + dirY * CAMERA.curDist + sy;
  CAMERA.z = tz + dirZ * CAMERA.curDist;
  CAMERA.lx = tx + fx * 6;
  CAMERA.ly = ty - 0.35;
  CAMERA.lz = tz + fz * 6;
  camera3.position.set(CAMERA.x, CAMERA.y, CAMERA.z);
  camera3.lookAt(CAMERA.lx, CAMERA.ly, CAMERA.lz);
  const spd = PLAYER.car ? Math.abs(PLAYER.car.long) : 0;
  const targetFov = 60 + clamp(spd * 0.55, 0, 16);
  camera3.fov = damp(camera3.fov, targetFov, 4, dt);
  camera3.updateProjectionMatrix();
}

/* ---------------- 시각 동기화 ---------------- */
function syncVisuals(dt) {
  // 플레이어 캐릭터
  if (CHAR) {
    CHAR.group.visible = !PLAYER.car;
    if (!PLAYER.car) {
      CHAR.group.position.set(PLAYER.x, PLAYER.y, PLAYER.z);
      CHAR.group.rotation.y = PLAYER.yaw;
      const moving = PLAYER.speed > 0.4;
      const amp = clamp(PLAYER.speed / 7, 0, 1);
      const sw = moving ? Math.sin(PLAYER.phase) * 0.85 * amp : 0;
      CHAR.legL.rotation.x = sw; CHAR.legR.rotation.x = -sw;
      CHAR.armL.rotation.x = -sw * 0.8; CHAR.armR.rotation.x = sw * 0.8;
      CHAR.group.position.y = PLAYER.y + (moving ? Math.abs(Math.sin(PLAYER.phase)) * 0.05 : 0);
      if (PLAYER.spinT > 0) {
        PLAYER.spinT -= dt;
        CHAR.group.rotation.y = PLAYER.yaw + TAU * clamp(1 - PLAYER.spinT / 0.65, 0, 1);
      }
      CHAR.group.visible = true;
      if (PLAYER.hidden) {
        CHAR.group.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.35; } });
      } else {
        CHAR.group.traverse(o => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; } });
      }
    }
    if (charShadow) {
      charShadow.visible = !PLAYER.car;
      charShadow.position.set(PLAYER.x, surfaceHeight(PLAYER.x, PLAYER.z) + 0.02, PLAYER.z);
      charShadow.material.opacity = PLAYER.hidden ? 0.12 : 0.35;
    }
  }

  // 차량 인스턴스
  let n = 0, nw = 0, nh = 0;
  const night = WORLD.night;
  for (const c of CARS) {
    if (n >= carParts.body.instanceMatrix.count) break;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const rx = -fz, rz = fx;
    const pitch = c.pitch, roll = c.roll;
    // 차체
    const lift = c.podiumLift || 0;
    setInst(carParts.body, n, c.x, c.y + 0.78 + lift, c.z, 0, c.yaw, 0, CAR_W, 0.82, CAR_L, c.color);
    // 캐빈
    const cabZ = -0.25, cabX = 0;
    const ox = fx * cabZ + rx * cabX, oz = fz * cabZ + rz * cabX;
    setInst(carParts.cabin, n, c.x + ox, c.y + 1.42 + lift, c.z + oz, 0, c.yaw, 0, CAR_W * 0.86, 0.70, CAR_L * 0.46, 0xffffff);
    // 바퀴 4개
    const wx = CAR_W / 2 - 0.06, wz = CAR_L / 2 - 1.15;
    for (let w = 0; w < 4; w++) {
      const sx = (w % 2 === 0 ? -1 : 1) * wx, sz = (w < 2 ? 1 : -1) * wz;
      const px = c.x + rx * sx + fx * sz, pz = c.z + rz * sx + fz * sz;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.yaw, 0));
      const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.wheelSpin, 0, 0));
      q.multiply(qs);
      _v3.set(px, c.y + 0.44 + lift, pz);
      _s3.set(1, 1, 1);
      _m4.compose(_v3, q, _s3);
      carParts.wheel.setMatrixAt(nw, _m4);
      nw++;
    }
    // 앞/뒤 등
    const hz = CAR_L / 2 - 0.05;
    setInst(carParts.head, nh, c.x + fx * hz, c.y + 0.86 + lift, c.z + fz * hz, 0, c.yaw, 0, 0.42, 0.20, 0.12, 0xffffff); nh++;
    setInst(carParts.head, nh, c.x + fx * hz + rx * 0.62, c.y + 0.86 + lift, c.z + fz * hz + rz * 0.62, 0, c.yaw, 0, 0.42, 0.20, 0.12, 0xffffff); nh++;
    const tz2 = -CAR_L / 2 + 0.05;
    setInst(carParts.tail, nh, c.x + fx * tz2, c.y + 0.88 + lift, c.z + fz * tz2, 0, c.yaw, 0, 0.44, 0.18, 0.12, 0xffffff); nh++;
    setInst(carParts.tail, nh, c.x + fx * tz2 + rx * 0.62, c.y + 0.88 + lift, c.z + fz * tz2 + rz * 0.62, 0, c.yaw, 0, 0.44, 0.18, 0.12, 0xffffff); nh++;
    n++;
  }
  carParts.body.count = n; carParts.cabin.count = n;
  carParts.wheel.count = nw; carParts.head.count = nh; carParts.tail.count = nh;
  for (const k in carParts) {
    carParts[k].instanceMatrix.needsUpdate = true;
    if (carParts[k].instanceColor) carParts[k].instanceColor.needsUpdate = true;
  }
  // 전조등/尾灯 밝기
  carParts.head.material.emissiveIntensity = 0.12 + night * 2.2;
  carParts.tail.material.emissiveIntensity = 0.45 + night * 1.2;

  // 보행자 인스턴스
  let np = 0;
  for (const p of PEDS) {
    if (np >= pedParts.body.instanceMatrix.count) break;
    const bob = Math.sin(p.phase) * 0.06;
    setInst(pedParts.body, np, p.x, p.y + 0.82 + bob, p.z, 0, p.yaw, 0, 1, 1, 1, p.color);
    setInst(pedParts.head, np, p.x, p.y + 1.48 + bob, p.z, 0, p.yaw, 0, 1, 1, 1, 0xe8c39a);
    np++;
  }
  pedParts.body.count = np; pedParts.head.count = np;
  pedParts.body.instanceMatrix.needsUpdate = true; pedParts.head.instanceMatrix.needsUpdate = true;
  if (pedParts.body.instanceColor) pedParts.body.instanceColor.needsUpdate = true;

  // 체크포인트 링
  updateCheckpointRings(GAME.time);
}

/* ---------------- 하늘/조명 ---------------- */
const SKY_KEYS = {
  day:   { zenith: 0x3f7fc4, horizon: 0xbcd9f2, ground: 0x5a5f63, sun: 0xfff2d8, sunI: 2.6, hemi: 0xbcd8f5, hemiG: 0x55524a, hemiI: 0.95, amb: 0.12, fogNear: 80, fogFar: 460 },
  dusk:  { zenith: 0x2c3a76, horizon: 0xff8f4d, ground: 0x4a3a38, sun: 0xff9a4a, sunI: 1.7, hemi: 0x8f7fb0, hemiG: 0x4a3a34, hemiI: 0.6, amb: 0.14, fogNear: 60, fogFar: 380 },
  night: { zenith: 0x050810, horizon: 0x141d33, ground: 0x0c0f16, sun: 0x8ea9ff, sunI: 0.35, hemi: 0x1a2340, hemiG: 0x0a0d14, hemiI: 0.35, amb: 0.3, fogNear: 40, fogFar: 280 }
};
const _cA = new THREE.Color(), _cB = new THREE.Color();
function lerpHex(a, b, t, out) {
  _cA.setHex(a); _cB.setHex(b);
  out.setRGB(lerp(_cA.r, _cB.r, t), lerp(_cA.g, _cB.g, t), lerp(_cA.b, _cB.b, t));
  return out;
}
function mixHex(target, amount, out) {
  _cB.setHex(target);
  out.setRGB(lerp(out.r, _cB.r, amount), lerp(out.g, _cB.g, amount), lerp(out.b, _cB.b, amount));
  return out;
}
function nightFactor(t) {
  if (t < 48) return 0;
  if (t < 92) return smoothstep(48, 92, t);
  if (t < 158) return 1;
  return lerp(1, 0.28, smoothstep(158, 180, t));
}
function updateSky() {
  const t = GAME.time;
  const night = GAME.night;
  WORLD.night = night;
  GLOBAL_U.uNight.value = night;
  const duskT = smoothstep(50, 74, t) * (1 - smoothstep(94, 112, t));
  const dayMix = clamp(1 - night, 0, 1);

  // 하늘 색
  lerpHex(SKY_KEYS.day.zenith, SKY_KEYS.night.zenith, night, WORLD.sky.material.uniforms.uZenith.value);
  lerpHex(SKY_KEYS.day.horizon, SKY_KEYS.night.horizon, night, WORLD.sky.material.uniforms.uHorizon.value);
  mixHex(SKY_KEYS.dusk.horizon, duskT * 0.85, WORLD.sky.material.uniforms.uHorizon.value);
  lerpHex(SKY_KEYS.day.ground, SKY_KEYS.night.ground, night, WORLD.sky.material.uniforms.uGround.value);

  // 태양/달
  let elev;
  if (t < 96) elev = lerp(58, -3, t / 96);
  else elev = lerp(-3, -30, (t - 96) / 84);
  const az = (t / 180) * TAU + 0.7;
  const e = elev * Math.PI / 180;
  let dx = Math.cos(e) * Math.sin(az), dy = Math.sin(e), dz = Math.cos(e) * Math.cos(az);
  const isNight = night > 0.55;
  if (isNight) { dx = -dx; dy = Math.abs(dy) * 0.8 + 0.25; dz = -dz; }
  const px = PLAYER.x, pz = PLAYER.z, py = PLAYER.y;
  WORLD.sun.position.set(px + dx * 200, py + dy * 200, pz + dz * 200);
  WORLD.sun.target.position.set(px, py, pz);
  WORLD.sun.target.updateMatrixWorld();
  lerpHex(SKY_KEYS.day.sun, SKY_KEYS.dusk.sun, duskT, WORLD.sun.color);
  if (isNight) WORLD.sun.color.setHex(SKY_KEYS.night.sun);
  WORLD.sun.intensity = lerp(SKY_KEYS.day.sunI, SKY_KEYS.night.sunI, night) * (isNight ? 1 : 1);
  lerpHex(SKY_KEYS.day.hemi, SKY_KEYS.night.hemi, night, WORLD.hemi.color);
  lerpHex(SKY_KEYS.day.hemiG, SKY_KEYS.night.hemiG, night, WORLD.hemi.groundColor);
  WORLD.hemi.intensity = lerp(SKY_KEYS.day.hemiI, SKY_KEYS.night.hemiI, night);
  WORLD.ambient.intensity = lerp(SKY_KEYS.day.amb, SKY_KEYS.night.amb, night);

  // 안개
  lerpHex(SKY_KEYS.day.horizon, SKY_KEYS.night.horizon, night, scene.fog.color);
  mixHex(SKY_KEYS.dusk.horizon, duskT * 0.85, scene.fog.color);
  scene.fog.near = lerp(SKY_KEYS.day.fogNear, SKY_KEYS.night.fogNear, night);
  scene.fog.far = lerp(SKY_KEYS.day.fogFar, SKY_KEYS.night.fogFar, night);

  // 가로등 / 네온
  WORLD.headMat.emissiveIntensity = night * 2.6;
  WORLD.poolMat.opacity = night * 0.45;
  if (WORLD.signMat) WORLD.signMat.color.setScalar(lerp(0.42, 1.0, night));
  if (WORLD.signGlowMat) WORLD.signGlowMat.opacity = night * 0.5;
  if (WORLD.storeMat) WORLD.storeMat.color.setScalar(lerp(0.5, 1.25, night));
  if (WORLD.sunSprite) {
    WORLD.sunSprite.position.set(px + dx * 700, py + dy * 700, pz + dz * 700);
    WORLD.sunSprite.material.color.setHex(isNight ? 0xbcd0ff : (duskT > 0.4 ? 0xffb060 : 0xfff0c0));
    WORLD.sunSprite.material.opacity = isNight ? 0.55 : 0.95;
  }
}

/* ---------------- 입력 ---------------- */
function normalizeCode(c) {
  c = String(c || '').toLowerCase();
  if (c === 'space' || c === 'spacebar') return ' ';
  if (c.startsWith('shift')) return 'shift';
  if (c === 'control' || c === 'controlleft') return 'ctrl';
  if (c.startsWith('arrow')) return c;
  return c;
}
const PENDING_RELEASE = new Set();
function onActionDown(a) {
  if (a === 'use') toggleVehicle();
  else if (a === 'violation') {
    raiseWanted(1);
    if (!PLAYER.car) PLAYER.spinT = 0.65;
  } else if (a === 'hide') toggleHide();
  else if (a === 'jump') PLAYER.jumpQueued = true;
  else if (a === 'map') toggleMissionPanel();
  else if (a === 'camera') CAMERA.dist = CAMERA.dist > 7 ? 5.2 : 8.6;
}
function setKey(code, down) {
  const c = normalizeCode(code);
  const action = KEY_ACTIONS[c];
  if (!action) return;
  const was = !!INPUT.down[action];
  INPUT.down[action] = down;
  if (down && !was) onActionDown(action);
}
function toggleHide() {
  if (PLAYER.hidden) { PLAYER.hidden = false; PLAYER.hiddenT = 0; setNotice('은폐 해제'); return; }
  PLAYER.hidden = true; PLAYER.hiddenT = 0;
  setNotice('은폐 — 시야를 감춰 순찰대를 따돌립니다');
}
function toggleMissionPanel() {
  missionPanelOpen = !missionPanelOpen;
  const p = document.getElementById('missions');
  if (p) p.style.display = missionPanelOpen ? 'block' : 'none';
  if (missionPanelOpen && document.pointerLockElement) document.exitPointerLock();
}
function bindInput(canvas) {
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
    setKey(e.code || e.key, true);
  });
  window.addEventListener('keyup', e => { setKey(e.code || e.key, false); });
  window.addEventListener('blur', () => { for (const k in INPUT.down) INPUT.down[k] = false; });

  canvas.addEventListener('click', () => {
    if (!missionPanelOpen && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas && !(e.buttons & 1)) return;
    CAMERA.yaw -= e.movementX * 0.0026;
    CAMERA.pitch = clamp(CAMERA.pitch + e.movementY * 0.0021, -0.25, 1.05);
    CAMERA.mouseIdle = 0;
  });
  document.addEventListener('pointerlockchange', () => {
    const hint = document.getElementById('lockHint');
    if (hint) hint.style.display = document.pointerLockElement === canvas ? 'none' : 'block';
  });
  // 임무 패널
  const panel = document.getElementById('missions');
  if (panel) {
    panel.querySelectorAll('[data-mission]').forEach(btn => {
      btn.addEventListener('click', () => {
        beginMission(btn.getAttribute('data-mission'));
        panel.style.display = 'none'; missionPanelOpen = false;
      });
    });
  }
}

/* ---------------- 렌더 루프 ---------------- */
let lastFrame = 0, fpsAcc = 0, fpsCount = 0, fpsTimer = 0, accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.25) dt = 0.25;
  if (dt <= 0) dt = 1 / 60;

  // FPS
  fpsAcc += dt; fpsCount++; fpsTimer += dt;
  if (fpsTimer > 0.4) { GAME.fps = fpsCount / fpsAcc; fpsAcc = 0; fpsCount = 0; fpsTimer = 0; }

  // 고정 스텝 시뮬레이션
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED && steps < 6) {
    simulateStep(FIXED);
    releasePending();
    accumulator -= FIXED;
    steps++;
  }
  if (steps >= 6) accumulator = 0;

  // 시각 갱신
  updateCamera(dt);
  updateSky();
  syncVisuals(dt);
  if (WORLD.waterNormal) {
    WORLD.waterNormal.offset.x = GAME.time * 0.012;
    WORLD.waterNormal.offset.y = GAME.time * 0.02;
  }
  LOD.timer += dt;
  if (LOD.timer > 0.35 || Math.hypot(PLAYER.x - LOD.lastX, PLAYER.z - LOD.lastZ) > 25) {
    LOD.timer = 0; LOD.lastX = PLAYER.x; LOD.lastZ = PLAYER.z;
    updateBuildingLOD(PLAYER.x, PLAYER.z);
    updateProps(PLAYER.x, PLAYER.z);
  }
  updateHUD();
  renderer.render(scene, camera3);
}
function releasePending() {
  for (const a of PENDING_RELEASE) INPUT.down[a] = false;
  PENDING_RELEASE.clear();
}

/* ---------------- 스폰 ---------------- */
function chooseSpawn() {
  const anchor = { x: -190, z: 190 };
  let best = null, bd = 1e9;
  for (const s of CITYDATA.stores) {
    const d = Math.hypot(s.x - anchor.x, s.z - anchor.z);
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) { PLAYER.x = anchor.x; PLAYER.z = anchor.z; return; }
  const nx = Math.sin(best.rot), nz = Math.cos(best.rot);
  PLAYER.x = best.x + nx * 8;
  PLAYER.z = best.z + nz * 8;
  PLAYER.y = groundAt(PLAYER.x, PLAYER.z, 3);
  PLAYER.yaw = Math.atan2(-nx, -nz);
  CAMERA.yaw = PLAYER.yaw;
}

/* ---------------- 초기화 ---------------- */
function init() {
  const canvas = document.getElementById('scene');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('fatal').style.display = 'block';
    document.getElementById('fatal').textContent = 'WebGL 초기화 실패: ' + e.message;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  camera3 = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.4, 1400);
  generateCity(20241115);
  scene = buildScene(renderer);
  WORLD.renderer = renderer;
  WORLD.camera = camera3;

  chooseSpawn();
  buildMissionMarker(scene);
  buildCharacter();
  buildVehicleParts();
  buildPedParts();
  spawnWorldEntities();
  initHUD();
  updateBuildingLOD(PLAYER.x, PLAYER.z);
  updateProps(PLAYER.x, PLAYER.z);
  bindInput(canvas);

  window.addEventListener('resize', () => {
    camera3.aspect = window.innerWidth / window.innerHeight;
    camera3.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById('boot').style.display = 'none';
  requestAnimationFrame(frame);
}

/* =========================================================
   테스트 / 자동화 인터페이스
   ========================================================= */
const TEST_API = {
  state: {
    get wanted() { return GAME.wanted; },
    get mission() { return GAME.mission; },
    get completed() { return GAME.completed; },
    get elapsed() { return GAME.elapsed; },
    get fps() { return GAME.fps; }
  },
  test: {
    key(code, down) { setKey(code, !!down); },
    press(code) {
      const c = normalizeCode(code);
      const action = KEY_ACTIONS[c];
      if (!action) return;
      setKey(c, true);
      PENDING_RELEASE.add(action);
    },
    step(dt) {
      const total = clamp(Number(dt) || 0, 0, 10);
      let rem = total;
      let guard = 0;
      while (rem > 1e-7 && guard < 2000) {
        const s = Math.min(FIXED, rem);
        simulateStep(s);
        releasePending();
        rem -= s;
        guard++;
      }
    },
    teleport(x, z, y) {
      const nx = Number(x) || 0, nz = Number(z) || 0;
      PLAYER.x = nx; PLAYER.z = nz;
      PLAYER.y = (y === undefined || y === null) ? groundAt(nx, nz, 16) : Number(y);
      PLAYER.vx = 0; PLAYER.vz = 0; PLAYER.vy = 0;
      if (PLAYER.car) {
        PLAYER.car.x = nx; PLAYER.car.z = nz;
        PLAYER.car.y = surfaceHeight(nx, nz, PLAYER.car.y);
        PLAYER.car.vx = 0; PLAYER.car.vz = 0;
      }
      CAMERA.y = PLAYER.y;
    },
    begin(mission) { beginMission(String(mission)); },
    setTime(t) { GAME.time = clamp(Number(t) || 0, 0, 179.999); }
  }
};
window.__game = TEST_API;
/* 자동 검증용 내부 상태 핸들 (계약에 없는 부분은 자유 설계) */
TEST_API.dbg = { PLAYER, CARS, PEDS, GAME, CITYDATA, WORLD, CAMERA, MISSIONS, CITY, INPUT };

/* 부트 */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
