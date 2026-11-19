/* headless Chrome(CDP) 검증 스크립트 — node verify/check.mjs [t1 t2 ...]
   창을 띄우지 않고 palace.html 을 렌더링해
   - window.__palace 계약 확인
   - 지정 시각 스크린샷 저장
*/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, '..', 'palace.html');
const SHOTS = resolve(HERE, 'shots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

mkdirSync(SHOTS, { recursive: true });

const times = process.argv.slice(2).map(Number);
const list = times.length ? times : [0, 3.5, 6, 9, 11, 14, 16, 20, 22, 25, 30, 31.9];

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--window-size=1920,1080',
  '--user-data-dir=' + resolve(HERE, '.chrome-profile'),
  `file://${PAGE}`,
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const j = await r.json();
      const page = j.find(t => t.type === 'page' && t.url.includes('palace.html'));
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome debug target not found');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}

try {
  const page = await targets();
  const cdp = await CDP.open(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await cdp.send('Console.enable');

  const errors = [];
  cdp.ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
  });

  await sleep(1200);
  const stats = await cdp.eval('JSON.stringify(window.__palace ? window.__palace.stats : null)');
  const diag = await cdp.eval('JSON.stringify(window.__palace ? window.__palace.diagnostics : null)');
  const hasTHREE = await cdp.eval('typeof THREE !== "undefined"');

  console.log('THREE loaded :', hasTHREE);
  console.log('stats        :', stats);
  console.log('diagnostics  :', diag);

  const parsed = stats ? JSON.parse(stats) : null;
  if (parsed) {
    const g = parsed.groups;
    const sum = g.terrace + g.pillars + g.brackets + g.roof + g.courtyard;
    console.log('group sum    :', sum, '=== bricks', parsed.bricks, sum === parsed.bricks ? 'OK' : 'MISMATCH');
    console.log('dimensionsCm :', parsed.dimensionsCm, 'generationMs:', parsed.generationMs);
  }

  for (const t of list) {
    await cdp.eval(`window.__palace.playing(false); window.__palace.seek(${t})`);
    await sleep(140);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(SHOTS, `t${String(t).replace('.', '_')}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log('shots        :', list.length, '→', SHOTS);
  if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log('  ', e)); }
  else console.log('page errors  : none');
} finally {
  chrome.kill('SIGKILL');
}
