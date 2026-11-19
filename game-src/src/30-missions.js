/* =========================================================
   한강시 — 미션 3종 (배달 / 추격 따돌리기 / 옥상 체크포인트)
   ========================================================= */

const MISSIONS = {
  delivery: { id: 'delivery', name: '심야 배달', limit: 90 },
  escape:   { id: 'escape', name: '추격 따돌리기', limit: 100 },
  roof:     { id: 'roof', name: '옥상 체크포인트', limit: 170 }
};

let missionMarker = null;
let markerRing = null;

function buildMissionMarker(scene) {
  const g = new THREE.Group();
  const beamGeo = new THREE.CylinderGeometry(2.0, 2.0, 30, 14, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 15;
  beam.renderOrder = 20;
  g.add(beam);
  const ringGeo = new THREE.TorusGeometry(2.4, 0.22, 8, 26);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.9, fog: false, toneMapped: false, depthTest: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  ring.renderOrder = 21;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  missionMarker = g;
  markerRing = ring;
  return g;
}
function setMarker(x, z, y, color) {
  if (!missionMarker) return;
  missionMarker.visible = true;
  missionMarker.position.set(x, y || 0, z);
  missionMarker.children[0].material.color.set(color);
  markerRing.material.color.set(color);
  GAME.target = { x, y: y || 0, z };
}
function hideMarker() {
  if (missionMarker) missionMarker.visible = false;
  GAME.target = null;
}

/* ---- 보행 표면 위의 목표 지점 찾기 ---- */
function findGroundSpot(x, z) {
  return groundAt(x, z, 999);
}
function nearestStore(x, z, maxDist, minDist) {
  let best = null, bd = maxDist;
  for (const s of CITYDATA.stores) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < minDist || d > bd) continue;
    bd = d; best = s;
  }
  return best;
}

function beginMission(id) {
  const def = MISSIONS[id];
  if (!def) return false;
  GAME.mission = id;
  GAME.missionData = { t: 0, stage: 0, pickup: null, drop: null, cp: 0, hideout: null };
  const D = GAME.missionData;

  if (id === 'delivery') {
    const st = nearestStore(PLAYER.x, PLAYER.z, 4000, 0) || CITYDATA.stores[0];
    D.pickup = { x: st.x, z: st.z };
    // 먼 배달지
    let best = null, bd = -1;
    for (const s of CITYDATA.stores) {
      const d = Math.hypot(s.x - st.x, s.z - st.z);
      if (d > bd && d > 230) { bd = d; best = s; }
    }
    D.drop = best ? { x: best.x, z: best.z } : { x: -st.x, z: -st.z };
    setMarker(D.pickup.x, D.pickup.z, findGroundSpot(D.pickup.x, D.pickup.z), 0x3fd8ff);
    setToast('심야 배달 — 상점 문 앞까지 이동하세요 (제한 ' + def.limit + '초)');
  } else if (id === 'escape') {
    raiseWanted(1);
    // 은신처 지점 — 강 위 교차로는 제외하고, 도로 위 안전한 지점을 고른다
    const cand = [];
    for (const n of CITYDATA.nodes) {
      if (n.z > CITY.RIVER_Z0 && n.z < CITY.RIVER_Z1) continue;
      if (!n.edges.length) continue;
      cand.push(n);
    }
    const node = cand.length ? cand[Math.floor(GAME.simRng() * cand.length) % cand.length] : CITYDATA.nodes[0];
    D.hideout = { x: node.x, z: node.z };
    setMarker(D.hideout.x, D.hideout.z, findGroundSpot(D.hideout.x, D.hideout.z), 0xffc857);
    setToast('추격 따돌리기 — 순찰대를 100초 버티거나 은신처로 이동 (R: 숨기)');
  } else if (id === 'roof') {
    const c = CITYDATA.skyCourse;
    for (const cp of c.checkpoints) cp.passed = false;
    D.cp = 0;
    const cp0 = c.checkpoints[0];
    setMarker(cp0.x, cp0.z, cp0.y, 0x8cff5a);
    setToast('옥상 체크포인트 — 고가 코스 진입 후 체크포인트 ' + (c.checkpoints.length) + '개를 순서대로 통과');
  }
  GAME.notice = def.name + ' 시작';
  GAME.noticeT = 2.6;
  return true;
}

function endMission(success, msg) {
  const id = GAME.mission;
  if (id && success && GAME.completed.indexOf(id) < 0) GAME.completed.push(id);
  GAME.mission = null;
  GAME.missionData = null;
  hideMarker();
  setToast(msg || (success ? '임무 완료!' : '임무 실패'));
}

function updateMission(dt) {
  if (!GAME.mission) return;
  const def = MISSIONS[GAME.mission];
  const D = GAME.missionData;
  D.t += dt;
  const remain = def.limit - D.t;

  if (GAME.mission === 'delivery') {
    if (D.stage === 0) {
      if (Math.hypot(PLAYER.x - D.pickup.x, PLAYER.z - D.pickup.z) < 5.0) {
        D.stage = 1;
        setMarker(D.drop.x, D.drop.z, findGroundSpot(D.drop.x, D.drop.z), 0x8cff5a);
        setNotice('배달물 수령 — 목적지로 이동!');
      }
    } else if (D.stage === 1) {
      if (Math.hypot(PLAYER.x - D.drop.x, PLAYER.z - D.drop.z) < 5.5) {
        endMission(true, '배달 완료! (+수배 해제 보너스)');
        GAME.wanted = 0;
        return;
      }
    }
    if (remain <= 0) { endMission(false, '배달 실패 — 시간 초과'); return; }
  } else if (GAME.mission === 'escape') {
    if (GAME.wanted === 0) { endMission(true, '추격 따돌림 성공!'); return; }
    if (Math.hypot(PLAYER.x - D.hideout.x, PLAYER.z - D.hideout.z) < 7.0) {
      endMission(true, '은신처 도착 — 추격 종료!');
      GAME.wanted = 0;
      return;
    }
    if (remain <= 0) { endMission(true, '순찰대 철수 — 추격 종료!'); GAME.wanted = 0; return; }
  } else if (GAME.mission === 'roof') {
    const c = CITYDATA.skyCourse;
    const cp = c.checkpoints[D.cp];
    if (cp) {
      const d = Math.hypot(PLAYER.x - cp.x, PLAYER.z - cp.z);
      if (d < 3.6 && Math.abs(PLAYER.y - (cp.y - 2.2)) < 5.0) {
        cp.passed = true;
        D.cp++;
        if (D.cp >= c.checkpoints.length) {
          endMission(true, '옥상 체크포인트 완주!');
          return;
        }
        const nx = c.checkpoints[D.cp];
        setMarker(nx.x, nx.z, nx.y, 0x8cff5a);
        setNotice('체크포인트 ' + D.cp + ' / ' + c.checkpoints.length);
      }
    }
    if (remain <= 0) { endMission(false, '옥상 레이스 실패 — 시간 초과'); return; }
  }
}

/* ---- 체크포인트 링 시각 처리 ---- */
function updateCheckpointRings(t) {
  const c = CITYDATA.skyCourse;
  for (const cp of c.checkpoints) {
    if (!cp.ring) continue;
    const active = GAME.mission === 'roof' && GAME.missionData && GAME.missionData.cp === cp.idx;
    const mat = cp.ring.material;
    const pulse = 0.6 + 0.5 * Math.sin(t * 3 + cp.idx);
    mat.emissiveIntensity = (cp.passed ? 0.35 : (active ? 2.6 + pulse : 1.1));
    mat.emissive.setHex(cp.passed ? 0x306040 : 0x3fd8ff);
    if (cp.sprite) cp.sprite.material.opacity = cp.passed ? 0.12 : (active ? 0.75 : 0.42);
    cp.ring.rotation.z = t * 0.6;
  }
  if (missionMarker && missionMarker.visible) {
    missionMarker.children[0].material.opacity = 0.22 + 0.14 * Math.sin(t * 2.6);
    markerRing.rotation.z = t * 1.1;
    markerRing.scale.setScalar(1 + 0.08 * Math.sin(t * 2.6));
  }
}
