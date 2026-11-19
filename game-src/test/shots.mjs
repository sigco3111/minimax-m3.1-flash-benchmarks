#!/usr/bin/env node
/* 한강시 — 시점별 스크린샷 (헤드리스 크롬) */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'shots');
mkdirSync(out, { recursive: true });
const FILE = 'file://' + join(here, '..', 'hangang-city.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1280,760', '--hide-scrollbars', '--mute-audio',
  '--user-data-dir=' + join(here, '.chrome-profile2'),
  FILE
], { stdio: ['ignore', 'ignore', 'ignore'] });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.url.startsWith('file://'));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('no target');
}
const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
await new Promise(r => ws.addEventListener('open', r));
function send(method, params) { const mid = ++id; return new Promise(res => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); }); }
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
}
await send('Runtime.enable'); await send('Page.enable');
for (let i = 0; i < 90; i++) {
  if (await ev('!!(window.__game && window.__game.dbg)')) break;
  await sleep(250);
}
await sleep(1500);

/* x,z = 도로 교차점, yaw = 카메라 방위(0=+z) */
const views = [
  { n: '01-day-street', t: 20, x: -152, z: 304, yaw: Math.PI },
  { n: '02-day-biz', t: 25, x: 228, z: -380, yaw: Math.PI },
  { n: '03-sunset', t: 78, x: -152, z: 304, yaw: Math.PI },
  { n: '04-night', t: 135, x: -152, z: 304, yaw: Math.PI },
  { n: '05-night-neon', t: 135, x: -76, z: 152, yaw: 0 },
  { n: '06-bridge', t: 45, x: -228, z: 0, yaw: 0 },
  { n: '07-expressway', t: 45, x: -100, z: -152, yaw: 0 },
  { n: '08-skycourse', t: 60, x: 46, z: 191, y: 1.5, yaw: 0 },
  { n: '09-river', t: 95, x: -60, z: -78, yaw: 0 },
  { n: '10-housing-alley', t: 30, x: -380, z: -300, yaw: 0 },
  { n: '11-mission-beacon', t: 95, x: -152, z: 304, yaw: 0, pre: `g.test.begin('delivery');g.test.step(0.2);` },
  { n: '12-police', t: 120, x: -152, z: 304, yaw: 0, pre: `g.test.press('e');g.test.press('e');g.test.step(6);` }
];
for (const v of views) {
  const y = v.y === undefined ? '' : (',' + v.y);
  await ev(`(function(){var g=window.__game,d=g.dbg;g.test.setTime(${v.t});g.test.teleport(${v.x},${v.z}${y});g.test.step(0.3);${v.pre || ''}d.CAMERA.yaw=${v.yaw};d.CAMERA.pitch=0.18;})()`);
  await sleep(1000);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    writeFileSync(join(out, v.n + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('captured', v.n);
  }
}
console.log('errors:', errors.length, errors.slice(0, 5));
ws.close(); chrome.kill('SIGKILL');
process.exit(0);
