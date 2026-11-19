/* =========================================================
   한강시 — HUD (미니맵 / 속도계 / 상태 표시)
   ========================================================= */

const HUD = {
  el: {}, mapStatic: null, mapScale: 0.62, mapSize: 960,
  mapCtx: null, speedoCtx: null, lastNotice: '', lastToast: ''
};

function initHUD() {
  HUD.el.wanted = document.getElementById('wanted');
  HUD.el.mission = document.getElementById('mission');
  HUD.el.missionSub = document.getElementById('missionSub');
  HUD.el.timer = document.getElementById('timer');
  HUD.el.clock = document.getElementById('clock');
  HUD.el.notice = document.getElementById('notice');
  HUD.el.toast = document.getElementById('toast');
  HUD.el.prompt = document.getElementById('prompt');
  HUD.el.arrow = document.getElementById('arrow');
  HUD.el.arrowLabel = document.getElementById('arrowLabel');
  HUD.el.fps = document.getElementById('fps');
  HUD.el.speedLabel = document.getElementById('speedLabel');
  HUD.el.help = document.getElementById('help');

  HUD.mapCtx = document.getElementById('minimap').getContext('2d');
  HUD.speedoCtx = document.getElementById('speedo').getContext('2d');
  buildStaticMap();
}

/* ---- 정적 도시 맵 (미니맵 배경) ---- */
function buildStaticMap() {
  const S = HUD.mapSize, sc = HUD.mapScale;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const toX = (x) => (x + CITY.HALF + 20) * sc;
  const toY = (z) => (z + CITY.HALF + 20) * sc;
  ctx.fillStyle = '#151a22';
  ctx.fillRect(0, 0, S, S);
  // 블록
  for (const b of CITYDATA.blocks) {
    if (b.type === 'river') continue;
    ctx.fillStyle = b.type === 'park' ? '#1e3226' : b.type === 'plaza' ? '#232833' : '#232936';
    ctx.fillRect(toX(b.x0), toY(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
  }
  // 강
  ctx.fillStyle = '#123049';
  ctx.fillRect(0, toY(CITY.RIVER_Z0), S, (CITY.RIVER_Z1 - CITY.RIVER_Z0) * sc);
  // 도로
  ctx.strokeStyle = '#4a5260';
  ctx.lineWidth = Math.max(1, CITY.ROAD * sc);
  ctx.beginPath();
  for (let k = 0; k <= CITY.GRID; k++) {
    const x = toX(roadX(k));
    ctx.moveTo(x, toY(-CITY.HALF - 10)); ctx.lineTo(x, toY(CITY.RIVER_Z0));
    ctx.moveTo(x, toY(CITY.RIVER_Z1)); ctx.lineTo(x, toY(CITY.HALF + 10));
  }
  for (let l = 0; l <= CITY.GRID; l++) {
    const y = toY(roadZ(l));
    ctx.moveTo(toX(-CITY.HALF - 10), y); ctx.lineTo(toX(CITY.HALF + 10), y);
  }
  ctx.stroke();
  // 다리
  ctx.strokeStyle = '#6c7484';
  ctx.lineWidth = Math.max(1.4, 16 * sc);
  for (const bx of CITY.BRIDGE_X) {
    ctx.beginPath(); ctx.moveTo(toX(bx), toY(CITY.RIVER_Z0)); ctx.lineTo(toX(bx), toY(CITY.RIVER_Z1)); ctx.stroke();
  }
  // 고가도로
  ctx.strokeStyle = '#7d6a4a';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = Math.max(1, 14 * sc);
  ctx.beginPath(); ctx.moveTo(toX(-CITY.HALF), toY(CITY.EXPR_Z)); ctx.lineTo(toX(CITY.HALF), toY(CITY.EXPR_Z)); ctx.stroke();
  ctx.setLineDash([]);
  HUD.mapStatic = cv;
}

function drawMinimap() {
  const ctx = HUD.mapCtx;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sc = HUD.mapScale;
  const view = W / sc; // 화면에 보이는 월드 크기
  const px = (PLAYER.x + CITY.HALF + 20) * sc;
  const py = (PLAYER.z + CITY.HALF + 20) * sc;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = '#0d1118';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(HUD.mapStatic, px - W / 2, py - H / 2, W / sc, H / sc, 0, 0, W, H);
  const toMap = (x, z) => [(x + CITY.HALF + 20) * sc - px + W / 2, (z + CITY.HALF + 20) * sc - py + H / 2];
  // 차량
  ctx.fillStyle = 'rgba(200,205,215,0.55)';
  for (const c of CARS) {
    if (c.police) continue;
    const d = Math.hypot(c.x - PLAYER.x, c.z - PLAYER.z);
    if (d > 130) continue;
    const [mx, my] = toMap(c.x, c.z);
    ctx.fillRect(mx - 1, my - 1, 2.4, 2.4);
  }
  // 경찰
  ctx.fillStyle = '#ff5566';
  for (const c of CARS) {
    if (!c.police) continue;
    const [mx, my] = toMap(c.x, c.z);
    ctx.beginPath(); ctx.arc(mx, my, 2.8, 0, TAU); ctx.fill();
  }
  // 임무 목표
  if (GAME.target) {
    const [mx, my] = toMap(GAME.target.x, GAME.target.z);
    ctx.strokeStyle = '#3fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 5 + Math.sin(GAME.time * 4) * 1.4, 0, TAU); ctx.stroke();
  }
  // 옥상 코스
  const cp0 = CITYDATA.skyCourse.checkpoints[0];
  if (cp0) {
    const [mx, my] = toMap(cp0.x, cp0.z);
    ctx.fillStyle = 'rgba(140,255,90,0.85)';
    ctx.fillRect(mx - 2, my - 2, 4, 4);
  }
  // 플레이어 화살표
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-PLAYER.yaw + Math.PI);
  ctx.fillStyle = '#ffe14d';
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6.5); ctx.lineTo(4.6, 5.2); ctx.lineTo(0, 2.8); ctx.lineTo(-4.6, 5.2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 테두리 + 북
  ctx.strokeStyle = 'rgba(120,200,255,0.55)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = 'rgba(220,240,255,0.85)';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText('N', W - 14, 14);
}

function drawSpeedo() {
  const ctx = HUD.speedoCtx;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const inCar = !!PLAYER.car;
  const kmh = inCar ? Math.abs(PLAYER.inCarSpeed) * 3.6 : PLAYER.speed * 3.6;
  const cx = W * 0.5, cy = H * 0.86, R = Math.min(W * 0.42, H * 0.78);
  const a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;
  // 눈금
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = a0 + (a1 - a0) * t;
    const major = i % 2 === 0;
    ctx.strokeStyle = major ? 'rgba(210,235,255,0.85)' : 'rgba(150,175,200,0.45)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - (major ? 13 : 7)), cy + Math.sin(a) * (R - (major ? 13 : 7)));
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = 'rgba(190,215,235,0.8)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(t * 200)), cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26) + 4);
    }
  }
  // 게이지 배경
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(cx, cy, R - 4, a0, a1); ctx.stroke();
  // 값
  const t = clamp(kmh / 200, 0, 1);
  const grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  grad.addColorStop(0, '#3fd8ff'); grad.addColorStop(0.6, '#8cff5a'); grad.addColorStop(1, '#ff5566');
  ctx.strokeStyle = grad; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, R - 4, a0, a0 + (a1 - a0) * t); ctx.stroke();
  // 바늘
  const a = a0 + (a1 - a0) * t;
  ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); ctx.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); ctx.stroke();
  ctx.fillStyle = '#0d1118'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
  // 숫자
  ctx.fillStyle = '#eaf4ff'; ctx.textAlign = 'center';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText(String(Math.round(kmh)), cx, cy - 18);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,220,240,0.8)';
  ctx.fillText('km/h', cx, cy - 4);
  if (inCar) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(160,255,200,0.9)';
    const gear = PLAYER.inCarSpeed < -0.4 ? 'R' : (Math.abs(PLAYER.inCarSpeed) < 0.4 ? 'N' : 'D');
    ctx.fillText('gear ' + gear + '   NOS ' + Math.round(GAME.nitro * 100) + '%', cx, cy + 16);
  } else {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,220,240,0.7)';
    ctx.fillText('도보', cx, cy + 16);
  }
}

function timeOfDayLabel() {
  const t = GAME.time % 180;
  if (t < 55) return '낮';
  if (t < 78) return '노을';
  if (t < 100) return '해질 무렵';
  if (t < 160) return '밤';
  return '새벽';
}
function clockString() {
  const t = GAME.time % 180;
  const mins = Math.floor((t / 180) * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return hh + ':' + mm;
}

function updateHUD() {
  const E = HUD.el;
  // 수배
  const stars = GAME.wanted > 0 ? '★'.repeat(GAME.wanted) + '☆'.repeat(3 - GAME.wanted) : '';
  if (E.wanted.innerHTML !== stars) E.wanted.innerHTML = stars;
  E.wanted.style.color = GAME.wanted === 0 ? 'rgba(200,220,240,0.35)' : (GAME.wanted === 3 ? '#ff5566' : '#ffc857');
  E.wanted.textContent = stars ? stars : '수배 없음';

  // 미션
  if (GAME.mission) {
    const def = MISSIONS[GAME.mission];
    const D = GAME.missionData;
    let sub = '';
    if (GAME.mission === 'delivery') sub = D.stage === 0 ? '상점에서 배달물 수령' : '목적지 배달 완료';
    else if (GAME.mission === 'escape') sub = '순찰대 회피 또는 은신처 이동';
    else if (GAME.mission === 'roof') sub = '체크포인트 ' + Math.min(D.cp + 1, CITYDATA.skyCourse.checkpoints.length) + ' / ' + CITYDATA.skyCourse.checkpoints.length;
    E.mission.textContent = def.name;
    E.missionSub.textContent = sub;
    const remain = Math.max(0, def.limit - D.t);
    E.timer.textContent = '⏱ ' + remain.toFixed(1) + 's';
    E.timer.style.display = '';
  } else {
    E.mission.textContent = GAME.completed.length ? '완료 임무: ' + GAME.completed.map(k => MISSIONS[k] ? MISSIONS[k].name : k).join(', ') : '자유 주행';
    E.missionSub.textContent = 'F 탑승 · E 수배↑ · R 숨기 · M 임무 시작';
    E.timer.style.display = 'none';
  }

  // 시계
  E.clock.textContent = timeOfDayLabel() + ' ' + clockString();

  // 알림 / 토스트
  if (GAME.noticeT > 0) { E.notice.textContent = GAME.notice; E.notice.style.opacity = String(clamp(GAME.noticeT / 0.6, 0, 1)); }
  else E.notice.style.opacity = '0';
  if (GAME.toastT > 0) { E.toast.textContent = GAME.toast; E.toast.style.opacity = String(clamp(GAME.toastT / 0.8, 0, 1)); }
  else E.toast.style.opacity = '0';

  // 상호작용 프롬프트
  let prompt = '';
  if (!PLAYER.car) {
    const c = nearestCar(5.0);
    if (c) prompt = 'F  차량 탑승';
  } else {
    prompt = 'F  하차';
  }
  E.prompt.textContent = prompt;

  // 목표 방향 화살표
  if (GAME.target) {
    const dx = GAME.target.x - PLAYER.x, dz = GAME.target.z - PLAYER.z;
    const ang = Math.atan2(dx, dz);
    const rel = wrapAngle(ang - CAMERA.yaw);
    E.arrow.style.display = '';
    E.arrowLabel.style.display = '';
    E.arrow.style.transform = 'translate(-50%,-50%) rotate(' + (rel * 180 / Math.PI) + 'deg)';
    E.arrow.style.opacity = String(clamp(1 - Math.abs(wrapAngle(rel + Math.PI)) / Math.PI, 0.15, 1));
    const dist = Math.round(Math.hypot(dx, dz));
    E.arrowLabel.textContent = dist + 'm';
  } else {
    E.arrow.style.display = 'none';
    E.arrowLabel.style.display = 'none';
  }

  E.fps.textContent = 'FPS ' + Math.round(GAME.fps);
  E.speedLabel.textContent = PLAYER.car ? (PLAYER.car.kind === 'taxi' ? '노을택시' : '승용차') : '도보';

  drawMinimap();
  drawSpeedo();
}
