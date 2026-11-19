#!/usr/bin/env node
/* 한강시 — 헤드리스 크롬 스모크 테스트 (CDP) */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + join(here, '..', 'hangang-city.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1280,760', '--hide-scrollbars', '--mute-audio',
  '--user-data-dir=' + join(here, '.chrome-profile'),
  FILE
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.url.startsWith('file://'));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome target not found\n' + chromeErr);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
const errors = [];

ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
    logs.push('[' + m.params.type + '] ' + text);
    if (m.params.type === 'error') errors.push(text);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG: ' + m.params.entry.text);
  }
});
await new Promise(r => ws.addEventListener('open', r));

function send(method, params) {
  const mid = ++id;
  return new Promise(res => { pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function evaluate(expr, awaitPromise) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
  const ex = r.result && r.result.exceptionDetails;
  if (ex) return { error: (ex.exception && ex.exception.description) || ex.text };
  return r.result && r.result.result ? r.result.result.value : undefined;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

let ready = false;
for (let i = 0; i < 90; i++) {
  const v = await evaluate('!!(window.__game && window.__game.dbg)');
  const boot = await evaluate('(function(){var b=document.getElementById("boot");return b?b.style.display:"gone"})()');
  if (v === true && boot === 'none') { ready = true; break; }
  await sleep(250);
}
console.log('ready:', ready);

const R = {};
const ev = (s) => evaluate(s);

R.init = await ev(`(function(){var g=window.__game,d=g.dbg;return JSON.stringify({
  fps:+g.state.fps.toFixed(1), elapsed:+g.state.elapsed.toFixed(2), wanted:g.state.wanted,
  mission:g.state.mission, completed:g.state.completed,
  player:[+d.PLAYER.x.toFixed(1),+d.PLAYER.z.toFixed(1),+d.PLAYER.y.toFixed(2)],
  cars:d.CARS.length, peds:d.PEDS.length, buildings:d.CITYDATA.buildings.length,
  blocks:d.CITYDATA.blocks.length, signs:d.CITYDATA.signs.length, stores:d.CITYDATA.stores.length,
  calls:d.WORLD.renderer.info.render.calls, tris:d.WORLD.renderer.info.render.triangles})})()`);

R.step1 = await ev('(function(){var g=window.__game;a=g.state.elapsed;g.test.step(1.0);return JSON.stringify({delta:+(g.state.elapsed-a).toFixed(6)})})()');
R.step2 = await ev('(function(){var g=window.__game;a=g.state.elapsed;g.test.step(0.5);return JSON.stringify({delta:+(g.state.elapsed-a).toFixed(6)})})()');
R.step3 = await ev('(function(){var g=window.__game;a=g.state.elapsed;g.test.step(0.25);return JSON.stringify({delta:+(g.state.elapsed-a).toFixed(6)})})()');

R.walk = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.teleport(0,200); g.test.step(0.2);
  var x0=d.PLAYER.x,z0=d.PLAYER.z;
  g.test.key('w',true); g.test.step(1.5); g.test.key('w',false);
  return JSON.stringify({dx:+(d.PLAYER.x-x0).toFixed(2), dz:+(d.PLAYER.z-z0).toFixed(2), speed:+d.PLAYER.speed.toFixed(2)})})()`);
R.run = await ev(`(function(){var g=window.__game,d=g.dbg;
  var x0=d.PLAYER.x,z0=d.PLAYER.z;
  g.test.key('w',true); g.test.key('shift',true); g.test.step(1.5); g.test.key('w',false); g.test.key('shift',false);
  return JSON.stringify({dist:+Math.hypot(d.PLAYER.x-x0,d.PLAYER.z-z0).toFixed(2)})})()`);
R.jump = await ev(`(function(){var g=window.__game,d=g.dbg;
  var y0=d.PLAYER.y; g.test.press(' '); g.test.step(0.25); var y1=d.PLAYER.y; g.test.step(1.2);
  return JSON.stringify({y0:+y0.toFixed(2), afterJump:+y1.toFixed(2), landed:+d.PLAYER.y.toFixed(2)})})()`);

R.teleport = await ev('(function(){var g=window.__game,d=g.dbg;g.test.teleport(100,100);g.test.step(0.2);return JSON.stringify({x:+d.PLAYER.x.toFixed(1),z:+d.PLAYER.z.toFixed(1),y:+d.PLAYER.y.toFixed(2)})})()');

R.enter = await ev(`(function(){var g=window.__game,d=g.dbg;
  var c=d.CARS.filter(function(c){return c.kind==='sedan';})[0];
  c.x=-152; c.z=152; c.y=0; c.yaw=Math.PI; c.vx=0; c.vz=0; c.long=0; c.lat=0; c.throttle=0; c.brake=0;
  g.test.teleport(-149,152); g.test.step(0.2);
  g.test.press('f'); g.test.step(0.2);
  return JSON.stringify({inCar:!!d.PLAYER.car, kind:d.PLAYER.car?d.PLAYER.car.kind:null})})()`);
R.drive = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.key('w',true); g.test.step(3.0);
  var kmh=Math.abs(d.PLAYER.inCarSpeed)*3.6;
  g.test.key('shift',true); g.test.step(1.0); var kmh2=Math.abs(d.PLAYER.inCarSpeed)*3.6;
  g.test.key('w',false); g.test.key('shift',false);
  return JSON.stringify({kmh:+kmh.toFixed(1), kmhBoost:+kmh2.toFixed(1), z:+d.PLAYER.z.toFixed(1)})})()`);
R.drift = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.key('w',true); g.test.step(2.5);
  g.test.key(' ',true); g.test.key('a',true);
  var maxLat=0;
  for(var i=0;i<12;i++){ g.test.step(0.1); maxLat=Math.max(maxLat,Math.abs(d.PLAYER.car.lat)); }
  g.test.key(' ',false); g.test.key('a',false); g.test.key('w',false);
  return JSON.stringify({maxLat:+maxLat.toFixed(2), kmh:+(Math.abs(d.PLAYER.inCarSpeed)*3.6).toFixed(1)})})()`);
R.exit = await ev(`(function(){var g=window.__game,d=g.dbg;g.test.press('f'); g.test.step(0.2);return JSON.stringify({inCar:!!d.PLAYER.car})})()`);

R.wanted = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.press('e'); g.test.step(0.2); var w1=g.state.wanted;
  g.test.press('e'); g.test.step(0.2); var w2=g.state.wanted;
  g.test.press('e'); g.test.step(0.2); var w3=g.state.wanted;
  var n=0; for(var i=0;i<d.CARS.length;i++) if(d.CARS[i].police) n++;
  return JSON.stringify({w1:w1,w2:w2,w3:w3,police:n})})()`);
R.hide = await ev(`(function(){var g=window.__game,d=g.dbg;g.test.press('r'); g.test.step(0.2); return JSON.stringify({hidden:d.PLAYER.hidden})})()`);

R.delivery = await ev(`(function(){var g=window.__game,d=g.dbg;g.test.begin('delivery');g.test.step(0.2);
  var t1=d.GAME.target?{x:+d.GAME.target.x.toFixed(1),z:+d.GAME.target.z.toFixed(1)}:null;
  var D=d.GAME.missionData;
  g.test.teleport(D.pickup.x,D.pickup.z); g.test.step(0.3);
  var stage1=d.GAME.missionData?d.GAME.missionData.stage:-1;
  g.test.teleport(D.drop.x,D.drop.z); g.test.step(0.3);
  return JSON.stringify({mission:g.state.mission, marker:t1, stageAfterPickup:stage1, missionEnd:g.state.mission, completed:g.state.completed})})()`);
R.escape = await ev(`(function(){var g=window.__game,d=g.dbg;g.test.begin('escape');g.test.step(0.2);
  return JSON.stringify({mission:g.state.mission,wanted:g.state.wanted})})()`);
R.escapeDone = await ev(`(function(){var g=window.__game,d=g.dbg;
  var h=d.GAME.missionData.hideout;
  g.test.teleport(h.x,h.z); g.test.step(0.3);
  return JSON.stringify({mission:g.state.mission, completed:g.state.completed})})()`);
R.roof = await ev(`(function(){var g=window.__game,d=g.dbg;g.test.begin('roof');g.test.step(0.2);
  var c=d.CITYDATA.skyCourse, reached=0;
  for(var i=0;i<c.checkpoints.length;i++){
    g.test.teleport(c.checkpoints[i].x,c.checkpoints[i].z,c.checkpoints[i].y-2.2);
    g.test.step(0.25);
    if(c.checkpoints[i].passed) reached++;
  }
  return JSON.stringify({mission:g.state.mission, reached:reached, completed:g.state.completed})})()`);

R.time = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.setTime(10); g.test.step(0.1); var day=d.WORLD.night, c1=document.getElementById('clock').textContent;
  g.test.setTime(78); g.test.step(0.1); var dusk=d.WORLD.night, c2=document.getElementById('clock').textContent;
  g.test.setTime(130); g.test.step(0.1); var night=d.WORLD.night, c3=document.getElementById('clock').textContent;
  g.test.setTime(10);
  return JSON.stringify({day:+day.toFixed(2),dusk:+dusk.toFixed(2),night:+night.toFixed(2),c1:c1,c2:c2,c3:c3})})()`);

/* 9) AI 교통 흐름 (30초 시뮬레이션 후 차량 분포/속도) */
R.ai = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.teleport(-152,304); g.test.step(0.2);
  g.test.step(30);
  var ai=d.CARS.filter(function(c){return c.ai;});
  var sp=ai.map(function(c){return Math.abs(c.long);});
  var avg=sp.reduce(function(a,b){return a+b;},0)/Math.max(1,sp.length);
  var stopped=sp.filter(function(v){return v<0.6;}).length;
  var moving=sp.filter(function(v){return v>3;}).length;
  var spread=ai.map(function(c){return Math.round(Math.hypot(c.x+152,c.z-304));});
  return JSON.stringify({aiCars:ai.length, avgSpeed:+avg.toFixed(2), stopped:stopped, moving:moving,
    maxDist:Math.max.apply(null,spread)})})()`);

/* 10) 경찰 추격 (수배 1 → 20초 후 거리) */
R.police = await ev(`(function(){var g=window.__game,d=g.dbg;
  g.test.teleport(-152,304); g.test.step(0.2);
  g.test.press('e'); g.test.step(0.1);
  var before=null;
  g.test.step(0.5);
  var p=d.CARS.filter(function(c){return c.police;})[0];
  if(p) before=Math.hypot(p.x+152,p.z-304);
  g.test.step(20);
  var p2=d.CARS.filter(function(c){return c.police;})[0];
  var after=p2?Math.hypot(p2.x+152,p2.z-304):null;
  return JSON.stringify({wanted:g.state.wanted, before:before&&+before.toFixed(1), after:after&&+after.toFixed(1)})})()`);

await sleep(2200);
R.perf = await ev(`(function(){var g=window.__game,d=g.dbg;var info=d.WORLD.renderer.info;
  return JSON.stringify({fps:+g.state.fps.toFixed(1), calls:info.render.calls, tris:info.render.triangles,
    geometries:info.memory.geometries, textures:info.memory.textures, programs:info.programs.length})})()`);

console.log(JSON.stringify(R, null, 2));
console.log('--- console logs (' + logs.length + ') ---');
logs.slice(0, 20).forEach(l => console.log(l));
console.log('--- errors (' + errors.length + ') ---');
errors.slice(0, 20).forEach(l => console.log(l));

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result && shot.result.data) {
  writeFileSync(join(here, 'shot.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot -> test/shot.png');
}
ws.close();
chrome.kill('SIGKILL');
process.exit(errors.length ? 1 : 0);
