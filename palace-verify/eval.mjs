import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, '..', 'palace.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + resolve(HERE, '.chrome-profile2'), `file://${PAGE}`], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let page;
for (let i = 0; i < 60; i++) {
  try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = j.find(t => t.type === 'page' && t.url.includes('palace.html')); if (page) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await sleep(1200);
for (const q of process.argv.slice(2)) console.log(q, '=>', JSON.stringify(await ev(q)));
chrome.kill('SIGKILL');
