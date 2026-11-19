// work/<task> 결과물을 저장소 루트 산출물 위치로 옮긴다(복사).
// 01~04 는 루트에 평탄하게(레퍼런스 저장소 구조), 05 는 hardware/ 폴더로.
// 사용: node tools/assemble.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.git') continue
    // 모델이 헤드리스 Chrome을 돌리며 남긴 프로필/캐시는 산출물이 아니다.
    if (e.name.startsWith('.chrome-profile')) continue
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) copyTree(s, d)
    else fs.copyFileSync(s, d)
  }
}

const summary = []
for (const slug of ['01-palace', '02-hangang-city', '03-model-intro', '04-novel']) {
  const src = path.join(root, 'work', slug)
  if (!fs.existsSync(src)) continue
  copyTree(src, root)
  const files = fs.readdirSync(src).filter((f) => f !== '.git')
  summary.push({ slug, files, bytes: fs.statSync(src).size })
}

const hwSrc = path.join(root, 'work', '05-hardware')
if (fs.existsSync(hwSrc)) {
  fs.rmSync(path.join(root, 'hardware'), { recursive: true, force: true })
  copyTree(hwSrc, path.join(root, 'hardware'))
  summary.push({ slug: '05-hardware', dir: 'hardware/' })
}
console.log(JSON.stringify(summary, null, 2))
