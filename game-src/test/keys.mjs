#!/usr/bin/env node
/* 한강시 — 실제 브라우저 키보드 이벤트 검증 (헤드리스 크롬, CDP)
 *
 * 확인 대상: W/A/S/D 이동, Shift 달리기, F 승하차, E 수배, R 은폐, C 카메라, M 임무 패널,
 *            방향키, Space 점프, 키 반복(repeat) 처리, 페이지 스크롤 방지.
 *
 * 입력 경로는 두 가지를 모두 건다.
 *   1) CDP Input.dispatchKeyEvent — 브라우저가 실제로 보내는 키보드 이벤트(code/key/repeat)
 *   2) window.dispatchEvent(new KeyboardEvent(...)) — code 경로와 key 전용 경로
 *
 * 사용: node test/keys.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// 검증 대상 HTML: 인자로 지정하거나, 소스 폴더 옆 / 저장소 루트 순으로 찾는다.
const HTML = process.argv[2] || [join(here, '..', 'hangang-city.html'), join(here, '..', '..', 'hangang-city.html')]
  .find(p => existsSync(p));
if (!HTML) { console.error('hangang-city.html 을 찾지 못했습니다'); process.exit(1); }
const FILE = 'file://' + HTML;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 이전 실행의 크롬이 남아 있어도 섞이지 않도록 매번 다른 포트·프로필을 쓴다.
const PORT = 9300 + Math.floor(Math.random() * 400);
const PROFILE = join(here, '.chrome-profile-keys-' + PORT);

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1280,760', '--hide-scrollbars', '--mute-audio',
  '--user-data-dir=' + PROFILE,
  FILE
], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && decodeURI(t.url) === decodeURI(FILE));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* 아직 안 뜸 */ }
    await sleep(250);
  }
  throw new Error('chrome target not found\n' + chromeErr);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('CONSOLE: ' + (m.params.args || []).map(a => a.value || a.description).join(' '));
  }
});
await new Promise(r => ws.addEventListener('open', r));
function send(method, params) {
  const mid = ++id;
  return new Promise(res => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const ex = r.result && r.result.exceptionDetails;
  if (ex) return { __error: (ex.exception && ex.exception.description) || ex.text };
  return r.result && r.result.result ? r.result.result.value : undefined;
}
await send('Runtime.enable');
await send('Page.enable');
// 헤드리스 크롬은 창이 포커스를 갖지 않아 수식 키를 누르면 window blur 가 한 번 발생해
// 게임이 "키를 놓았다"고 처리한다. 포커스 에뮬레이션으로 실제 브라우저와 같은 상태를 만든다.
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

let ready = false;
for (let i = 0; i < 90; i++) {
  const v = await ev('!!(window.__game && window.__game.dbg)');
  const boot = await ev('(function(){var b=document.getElementById("boot");return b?b.style.display:"gone"})()');
  if (v === true && boot === 'none') { ready = true; break; }
  await sleep(250);
}
if (!ready) { console.log('부팅 실패'); chrome.kill('SIGKILL'); process.exit(1); }
await sleep(800);

/* ---------------- 실제 키 이벤트 ---------------- */
const VK = {
  KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyF: 70, KeyE: 69, KeyR: 82, KeyC: 67, KeyM: 77,
  ShiftLeft: 16, Space: 32, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39
};
const CHAR_KEY = /^[a-zA-Z]$/;   // 문자키만 text 를 붙인다(선택적 글자 입력 방지)

async function cdpDown(code, key, repeat) {
  const p = {
    type: CHAR_KEY.test(key) ? 'keyDown' : 'rawKeyDown',
    code, key,
    windowsVirtualKeyCode: VK[code] || 0,
    nativeVirtualKeyCode: VK[code] || 0,
    autoRepeat: !!repeat
  };
  if (CHAR_KEY.test(key)) { p.text = key; p.unmodifiedText = key; }
  await send('Input.dispatchKeyEvent', p);
}
async function cdpUp(code, key) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', code, key,
    windowsVirtualKeyCode: VK[code] || 0,
    nativeVirtualKeyCode: VK[code] || 0
  });
}
/* 합성 KeyboardEvent (window 로 직접 dispatch) */
function synth(code, key, repeat) {
  return `(function(){
    var e = new KeyboardEvent('keydown', {code:${JSON.stringify(code)}, key:${JSON.stringify(key)}, repeat:${!!repeat}, bubbles:true, cancelable:true});
    window.dispatchEvent(e);
    return e.defaultPrevented;
  })()`;
}
function synthUp(code, key) {
  return `(function(){
    window.dispatchEvent(new KeyboardEvent('keyup', {code:${JSON.stringify(code)}, key:${JSON.stringify(key)}, bubbles:true, cancelable:true}));
  })()`;
}

/* ---------------- 검사 결과 수집 ---------------- */
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : JSON.stringify(detail) });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail === undefined ? '' : '   ' + JSON.stringify(detail)));
}
const pos = () => ev('(function(){var p=window.__game.dbg.PLAYER;return {x:p.x,z:p.z,y:p.y};})()');
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const step = (s) => ev(`window.__game.test.step(${s})`);

/* 위치가 갈리는 곳으로 옮기고 조준 방향을 정해 이동량을 측정한다. */
async function place(x, z, yaw) {
  await ev(`(function(){var g=window.__game,d=g.dbg;g.test.teleport(${x},${z});d.CAMERA.yaw=${yaw};g.test.step(0.2);})()`);
}

/* 1) CDP 실제 키보드 이벤트: W / A / S / D */
console.log('\n[1] CDP Input.dispatchKeyEvent — 알파벳 이동');
for (const [code, key, label] of [['KeyW', 'w', 'W'], ['KeyA', 'a', 'A'], ['KeyS', 's', 'S'], ['KeyD', 'd', 'D']]) {
  await place(-152, 304, 0);
  const p0 = await pos();
  await cdpDown(code, key);
  await step(0.5);
  const p1 = await pos();
  await cdpUp(code, key);
  await step(0.6);                       // 관성 감쇠까지 기다린 뒤 정지 여부 확인
  const p2 = await pos();
  const moved = dist(p0, p1);
  const speed = await ev('window.__game.dbg.PLAYER.speed');
  check(`${label} (code=${code}) 로 이동`, moved > 0.5, { 이동거리: +moved.toFixed(3) });
  check(`${label} keyup 후 정지`, speed < 0.5, { 남은속도kmh: +Number(speed).toFixed(2), 관성거리: +dist(p1, p2).toFixed(3) });
}

/* 2) Shift 달리기 */
console.log('\n[2] Shift 달리기');
async function runDistance(shift) {
  await place(-152, 304, 0);
  const a = await pos();
  if (shift) await cdpDown('ShiftLeft', 'Shift');
  await cdpDown('KeyW', 'w');
  await step(1.0);
  const b = await pos();
  await cdpUp('KeyW', 'w');
  if (shift) await cdpUp('ShiftLeft', 'Shift');
  await step(0.3);
  return dist(a, b);
}
const walkDist = await runDistance(false);
const runDist = await runDistance(true);
check('Shift+W 가 W 보다 빠름', runDist > walkDist * 1.5, { 도보: +walkDist.toFixed(2), 달리기: +runDist.toFixed(2) });

/* 3) F 승하차 · E 수배 · R 은폐 · C 카메라 · M 임무 패널 */
console.log('\n[3] 기능 키');
await place(-152, 304, 0);
await ev(`(function(){var g=window.__game,d=g.dbg;
  var c=d.CARS.filter(function(c){return c.kind==='sedan';})[0]||d.CARS[0];
  c.x=-152;c.z=304;c.y=0;c.vx=0;c.vz=0;c.yaw=0;
  g.test.teleport(-149.5,304); g.test.step(0.2);})()`);
await cdpDown('KeyF', 'f'); await step(0.15); await cdpUp('KeyF', 'f'); await step(0.1);
const inCar = await ev('!!window.__game.dbg.PLAYER.car');
check('F 로 차량 탑승', inCar === true, { inCar });
await cdpDown('KeyF', 'f'); await step(0.15); await cdpUp('KeyF', 'f'); await step(0.1);
const outCar = await ev('!!window.__game.dbg.PLAYER.car');
check('F 로 차량 하차', outCar === false, { inCar: outCar });

await place(-152, 304, 0);
const w0 = await ev('window.__game.state.wanted');
await cdpDown('KeyE', 'e'); await step(0.15); await cdpUp('KeyE', 'e'); await step(0.1);
const w1 = await ev('window.__game.state.wanted');
check('E 로 수배 +1', w1 === w0 + 1, { before: w0, after: w1 });

await place(-152, 304, 0);
await cdpDown('KeyR', 'r'); await step(0.15); await cdpUp('KeyR', 'r'); await step(0.1);
const hidden = await ev('window.__game.dbg.PLAYER.hidden');
check('R 로 은폐', hidden === true, { hidden });

await place(-152, 304, 0);
const cam0 = await ev('window.__game.dbg.CAMERA.dist');
await cdpDown('KeyC', 'c'); await step(0.15); await cdpUp('KeyC', 'c'); await step(0.1);
const cam1 = await ev('window.__game.dbg.CAMERA.dist');
check('C 로 카메라 거리 전환', cam0 !== cam1, { before: cam0, after: cam1 });

await place(-152, 304, 0);
const map0 = await ev('(function(){return document.getElementById("missions").style.display;})()');
await cdpDown('KeyM', 'm'); await step(0.15); await cdpUp('KeyM', 'm'); await step(0.1);
const map1 = await ev('(function(){return document.getElementById("missions").style.display;})()');
check('M 으로 임무 패널 열림', map0 !== map1 && map1 === 'block', { before: map0, after: map1 });
await cdpDown('KeyM', 'm'); await step(0.15); await cdpUp('KeyM', 'm'); await step(0.1);

/* 4) 방향키 · Space 점프 */
console.log('\n[4] 방향키 · Space');
await place(-152, 304, 0);
let p0 = await pos();
await cdpDown('ArrowUp', 'ArrowUp'); await step(0.5);
let p1 = await pos();
await cdpUp('ArrowUp', 'ArrowUp'); await step(0.2);
check('ArrowUp 이동', dist(p0, p1) > 0.5, { 이동거리: +dist(p0, p1).toFixed(3) });

await place(-152, 304, 0);
p0 = await pos();
await cdpDown('ArrowLeft', 'ArrowLeft'); await step(0.5);
p1 = await pos();
await cdpUp('ArrowLeft', 'ArrowLeft'); await step(0.2);
check('ArrowLeft 이동', dist(p0, p1) > 0.5, { 이동거리: +dist(p0, p1).toFixed(3) });

await place(-152, 304, 0);
const y0 = await ev('window.__game.dbg.PLAYER.y');
await cdpDown('Space', ' '); await step(0.25);
const y1 = await ev('window.__game.dbg.PLAYER.y');
await cdpUp('Space', ' '); await step(1.2);
check('Space 점프', y1 > y0 + 0.2, { y0: +y0.toFixed(2), y1: +y1.toFixed(2) });

/* 5) 키 반복(repeat) 은 동작을 다시 발동시키지 않는다 */
console.log('\n[5] 키 반복 처리');
await place(-152, 304, 0);
await ev('window.__game.dbg.GAME.wanted = 0');
await cdpDown('KeyE', 'e');
await cdpDown('KeyE', 'e', true);      // autoRepeat
await cdpDown('KeyE', 'e', true);
await step(0.15);
await cdpUp('KeyE', 'e'); await step(0.1);
const wRep = await ev('window.__game.state.wanted');
check('반복 keydown 은 수배를 올리지 않는다', wRep === 1, { wanted: wRep });

/* 6) 브라우저 기본 동작(페이지 스크롤) 방지 */
console.log('\n[6] 기본 동작 방지');
await ev(`(function(){window.__kd=[];window.addEventListener('keydown',function(e){window.__kd.push({code:e.code,prevented:e.defaultPrevented});});})()`);
await cdpDown('Space', ' '); await cdpUp('Space', ' ');
await cdpDown('ArrowDown', 'ArrowDown'); await cdpUp('ArrowDown', 'ArrowDown');
await cdpDown('KeyW', 'w'); await cdpUp('KeyW', 'w');
await sleep(150);
const kd = await ev('window.__kd');
const prevented = kd.reduce((a, k) => (a[k.code] = k.prevented, a), {});
check('Space 스크롤 차단', prevented['Space'] === true, prevented);
check('ArrowDown 스크롤 차단', prevented['ArrowDown'] === true, prevented);
check('문자키(W)는 기본 동작 유지', prevented['KeyW'] === false, prevented);

/* 7) 합성 KeyboardEvent 경로: e.code 경로 / e.key 전용 경로 */
console.log('\n[7] window.dispatchEvent(new KeyboardEvent(...)) 경로');
async function synthMove(label, code, key, extraCode) {
  await place(-152, 304, 0);
  const a = await pos();
  await ev(synth(code, key));
  if (extraCode) await ev(synth(extraCode, extraCode === 'ShiftLeft' ? 'Shift' : ''));
  await step(0.5);
  const b = await pos();
  if (extraCode) await ev(synthUp(extraCode, extraCode === 'ShiftLeft' ? 'Shift' : ''));
  await ev(synthUp(code, key));
  await step(0.2);
  const moved = dist(a, b);
  check(label, moved > 0.5, { 이동거리: +moved.toFixed(3) });
}
await synthMove('code=KeyW 이동', 'KeyW', 'w');
await synthMove('code=KeyA 이동', 'KeyA', 'a');
await synthMove('code=KeyD 이동', 'KeyD', 'd');
await synthMove('code=KeyS 이동', 'KeyS', 's');
await synthMove('code 없음 + key=w 이동', '', 'w');
await synthMove('code 없음 + key=a 이동', '', 'a');
await synthMove('code=ArrowUp 이동', 'ArrowUp', 'ArrowUp');
/* Shift 는 W 와 함께 눌러야 이동한다 */
await place(-152, 304, 0);
{
  const a = await pos();
  await ev(synth('ShiftLeft', 'Shift'));
  await ev(synth('KeyW', 'w'));
  await step(1.0);
  const b = await pos();
  await ev(synthUp('KeyW', 'w'));
  await ev(synthUp('ShiftLeft', 'Shift'));
  const moved = dist(a, b);
  check('code=ShiftLeft + KeyW 달리기', moved > 5, { 이동거리: +moved.toFixed(3) });
}

/* 8) test API 계약이 그대로 살아 있는지 */
console.log('\n[8] 검증 계약(window.__game)');
const api = await ev('(function(){var g=window.__game;return {state:["wanted","mission","completed","elapsed","fps"].every(function(k){return k in g.state;}),test:["key","press","step","teleport","begin","setTime"].every(function(k){return typeof g.test[k]==="function";})};})()');
check('state/test 계약 유지', api.state === true && api.test === true, api);
const legacy = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.teleport(-152,304); g.test.step(0.2);
  var x0=d.PLAYER.x,z0=d.PLAYER.z;
  g.test.key('w',true); g.test.step(0.5); g.test.key('w',false);
  return {dist:+Math.hypot(d.PLAYER.x-x0,d.PLAYER.z-z0).toFixed(2)};})()`);
check("test.key('w') 기존 경로", legacy.dist > 0.5, legacy);

/* 9) 부팅 오류 없음 */
console.log('\n[9] 콘솔 오류');
check('런타임 예외/콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));

const failed = results.filter(r => !r.ok);
console.log('\n===== 결과: ' + (results.length - failed.length) + '/' + results.length + ' 통과 =====');
if (failed.length) {
  console.log('실패:');
  failed.forEach(f => console.log('  - ' + f.name + '  ' + f.detail));
}
ws.close();
try { process.kill(-chrome.pid, 'SIGKILL'); } catch (e) { chrome.kill('SIGKILL'); }
try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* 프로필 정리 실패는 무시 */ }
process.exit(failed.length ? 1 : 0);
