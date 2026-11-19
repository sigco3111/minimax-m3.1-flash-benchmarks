// 결과 화면 스크린샷 생성 (index.html 카드용). headless Chrome.
// 사용: node tools/shots.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const out = path.join(root, 'verification')
fs.mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

const shots = [
  { file: 'palace.html', name: 'shot-palace', t: 10 },
  { file: 'hangang-city.html', name: 'shot-hangang', t: 0 },
  { file: 'model-intro.html', name: 'shot-intro', t: 0 },
  { file: 'novel.html', name: 'shot-novel', t: 0 },
]

for (const s of shots) {
  const p = await browser.newPage()
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await p.goto('file://' + root + '/' + s.file, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 4000))
  if (s.file === 'palace.html') {
    await p.evaluate(() => window.__palace?.seek?.(10)).catch(() => {})
  }
  await new Promise((r) => setTimeout(r, 1200))
  await p.screenshot({ path: path.join(out, s.name + '.png') })
  console.log(s.name + '.png')
  await p.close()
}
await browser.close()
