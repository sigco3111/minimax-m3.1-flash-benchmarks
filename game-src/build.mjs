#!/usr/bin/env node
/* 한강시 — 단일 HTML 빌드 (three.js + 게임 소스 인라인) */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');

const ORDER = [
  '00-util.js',
  '10-world.js',
  '15-mesh.js',
  '20-entities.js',
  '30-missions.js',
  '40-hud.js',
  '50-main.js'
];

// three.js 위치: 소스 폴더 옆 vendor/ 를 먼저 보고, 없으면 상위 폴더의 vendor/ 를 쓴다.
const threePath = [join(here, 'vendor', 'three.min.js'), join(here, '..', 'vendor', 'three.min.js')]
  .find(p => existsSync(p));
if (!threePath) throw new Error('three.min.js 를 찾지 못했습니다 (vendor/three.min.js)');

const three = readFileSync(threePath, 'utf8');
const game = ORDER.map(f => `\n/* ==== ${f} ==== */\n` + readFileSync(join(src, f), 'utf8')).join('\n');
const tpl = readFileSync(join(src, 'template.html'), 'utf8');

const out = tpl
  .replace('/*__THREE__*/', () => three)
  .replace('/*__GAME__*/', () => '(function(){"use strict";\n' + game + '\n})();');

const dest = process.argv[2] ? process.argv[2] : join(here, 'hangang-city.html');
writeFileSync(dest, out, 'utf8');
console.log('built', dest, (out.length / 1024).toFixed(1) + ' KB', '(three:', threePath + ')');
