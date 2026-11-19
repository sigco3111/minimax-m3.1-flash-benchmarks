#!/usr/bin/env node
/* 한강시 — 단일 HTML 빌드 (three.js + 게임 소스 인라인) */
import { readFileSync, writeFileSync } from 'node:fs';
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

const three = readFileSync(join(here, 'vendor', 'three.min.js'), 'utf8');
const game = ORDER.map(f => `\n/* ==== ${f} ==== */\n` + readFileSync(join(src, f), 'utf8')).join('\n');
const tpl = readFileSync(join(src, 'template.html'), 'utf8');

const out = tpl
  .replace('/*__THREE__*/', () => three)
  .replace('/*__GAME__*/', () => '(function(){"use strict";\n' + game + '\n})();');

const dest = join(here, 'hangang-city.html');
writeFileSync(dest, out, 'utf8');
console.log('built', dest, (out.length / 1024).toFixed(1) + ' KB');
