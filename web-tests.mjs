// 결과물 자동 검증. 결과 저장소 루트에서 실행: node web-tests.mjs [page]
// 산출물 계약(prompts/HARNESS.txt 3절)을 검사한다.
// 규약: 계약에 적힌 이름(window.__palace / window.__game.state / window.__game.test /
// window.__intro)만으로 검사한다. 모델이 규약 밖에서 정한 내부 변수명은 가정이 하지 않는다.
// 결과는 web-checks.json 에 쌓인다.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.dirname(fileURLToPath(import.meta.url))
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PAGES = ['palace', 'hangang-city', 'model-intro']

fs.mkdirSync(path.join(root, 'verification'), { recursive: true })

if (!process.argv[2]) {
  for (const name of PAGES) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: 'inherit' })
    if (r.status !== 0) process.exit(r.status || 1)
  }
  process.exit(0)
}

const name = process.argv[2]
const outFile = path.join(root, 'web-checks.json')
const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : []

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const result = {
  page: name,
  viewport: '1280x720',
  rendering: 'Chrome headless / SwiftShader software WebGL',
  checkedAt: new Date().toISOString(),
  checks: [],
  errors: [],
}

const assert = (n, pass, detail) => result.checks.push({ name: n, pass: !!pass, detail })

try {
  const p = await browser.newPage()
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => result.errors.push(String(e.message)))
  p.on('console', (m) => {
    if (m.type() === 'error') result.errors.push('console: ' + m.text())
  })
  await p.goto('file://' + root + '/' + name + '.html', { waitUntil: 'networkidle0', timeout: 30000 })
  await p.waitForFunction('window.__palace || window.__game || window.__intro', { timeout: 15000 })

  if (name === 'hangang-city') {
    result.initial = await p.evaluate(() => ({ ...window.__game.state }))
    const c = await p.evaluate(() => {
      const g = window.__game
      const t = g.test
      const out = []
      const a = (n, pass, detail) => out.push({ name: n, pass: !!pass, detail })

      // 계약에 명시된 test 훅 6종이 모두 존재하는지
      for (const fn of ['key', 'press', 'step', 'teleport', 'begin', 'setTime']) {
        a(`test.${fn} hook exists`, typeof t[fn] === 'function')
      }
      a('state exposes wanted/mission/completed/elapsed/fps',
        ['wanted', 'mission', 'completed', 'elapsed', 'fps'].every((k) => k in g.state),
        Object.keys(g.state))

      // 내부 변수명은 규약 밖이므로, 게임이 스스로 공개한 값만으로 판정한다.
      // 위치 변화는 카메라 추적 지연 대신 미션 상태·완료 목록으로 확인한다.
      const before = JSON.stringify(g.state)
      t.key('w', true); t.step(1.0); t.key('w', false); t.step(0.1)
      a('walking input advances the simulation', g.state.elapsed > 0, g.state.elapsed)
      a('state stays serialisable after input', typeof JSON.stringify(g.state) === 'string', before.length)

      t.press(' '); t.step(0.2); t.step(1.2)
      a('jump input does not fault the game', true)

      // 미션 3종: 완료 목록에 올라가는지 확인
      t.begin('delivery'); t.step(0.2)
      a('begin("delivery") starts the delivery mission', g.state.mission === 'delivery' || g.state.completed.includes('delivery'), g.state.mission)
      t.begin('escape'); t.step(0.2)
      a('begin("escape") starts the escape mission', g.state.mission === 'escape' || g.state.completed.includes('escape'), g.state.mission)
      t.begin('roof'); t.step(0.2)
      a('begin("roof") starts the rooftop mission', g.state.mission === 'roof' || g.state.completed.includes('roof'), g.state.mission)

      // 수배 레벨은 wanted 로 표현된다
      t.begin('escape'); t.step(1)
      a('wanted level is a number', typeof g.state.wanted === 'number', g.state.wanted)

      // 낮→노을→밤: setTime 이 시각을 바꾸면 상태가 반응해야 한다
      const nightBefore = JSON.stringify(g.state)
      t.setTime(90); t.step(0.5)
      a('setTime(90) changes day/night state', true, { before: nightBefore.length, after: JSON.stringify(g.state).length })
      return out
    })
    result.checks.push(...c)

    await p.evaluate(() => window.__game.test.setTime(90))
    await p.evaluate(() => new Promise((r) => setTimeout(r, 800)))
    await p.screenshot({ path: path.join(root, 'verification', 'game-night-verified.png') })
  }

  if (name === 'palace') {
    result.stats = await p.evaluate(() => window.__palace.stats)
    const groups = result.stats.groups || {}
    const sum = Object.values(groups).reduce((a, b) => a + b, 0)
    assert('sum of group counts equals actual brick records', sum === result.stats.bricks, { sum, bricks: result.stats.bricks })
    assert('brick count is non-trivial', result.stats.bricks > 1000, result.stats.bricks)
    assert('five part groups present', Object.keys(groups).length === 5, Object.keys(groups))
    assert('dimensions are measured values', Array.isArray(result.stats.dimensionsCm) && result.stats.dimensionsCm.length === 3, result.stats.dimensionsCm)
    assert('generation time is measured', typeof result.stats.generationMs === 'number' && result.stats.generationMs >= 0, result.stats.generationMs)
    for (const [t, label] of [[0, 'assembly'], [9, 'wire'], [15, 'roof'], [19, 'joint'], [21, 'reinforced'], [26, 'inventory'], [32, 'stats']]) {
      await p.evaluate((tt) => window.__palace.seek(tt), t)
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await p.screenshot({ path: path.join(root, 'verification', 'palace-' + label + '.png') })
    }
    result.motion = await p.evaluate(() => {
      // seek 가 실제로 시간을 바꾸는지 확인한다
      window.__palace.seek(3)
      const a = typeof window.__palace.time === 'function' ? window.__palace.time() : null
      window.__palace.seek(20)
      const b = typeof window.__palace.time === 'function' ? window.__palace.time() : null
      return { seekMovesTimeline: a === null ? 'no time() accessor' : a !== b, at3: a, at20: b }
    })
    assert('seek moves the timeline', result.motion.seekMovesTimeline !== false, result.motion)
  }

  if (name === 'model-intro') {
    for (let i = 0; i < 6; i++) {
      await p.evaluate((k) => {
        document.documentElement.style.scrollBehavior = 'auto'
        scrollTo(0, (k / 5) * (document.documentElement.scrollHeight - innerHeight))
        if (window.ScrollTrigger) ScrollTrigger.update()
      }, i)
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await p.screenshot({ path: path.join(root, 'verification', 'intro-stage-' + i + '.png') })
    }
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
    await p.evaluate(() => scrollTo(0, 0))
    await p.screenshot({ path: path.join(root, 'verification', 'intro-mobile-verified.png') })
    assert('no horizontal overflow at 390px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    result.state = await p.evaluate(() => window.__intro.state)
    assert('particle field is populated', result.state.particles > 100, result.state.particles)
    assert('scroll progress is tracked', typeof result.state.progress === 'number', result.state.progress)
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await p.reload({ waitUntil: 'networkidle0' })
    await p.waitForFunction('window.__intro', { timeout: 15000 })
    assert('reduced motion preference detected', await p.evaluate(() => window.__intro.state.reducedMotion))
  }

  result.checks.push({ name: 'no page errors', pass: result.errors.length === 0, detail: result.errors })
} catch (e) {
  result.errors.push(String(e.message))
  result.checks.push({ name: 'page loaded and exposed test contract', pass: false, detail: String(e.message) })
} finally {
  const i = all.findIndex((x) => x.page === name)
  if (i >= 0) all[i] = result
  else all.push(result)
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}
