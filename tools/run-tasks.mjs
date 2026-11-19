// 5개 과제를 지정 모델로 1회씩 실행한다.
// 조건: 동일 프롬프트, 동일 effort, 모델당 단일 시도, 과제별 독립 디렉터리.
// 사용: node tools/run-tasks.mjs [taskSlug ...]
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = process.env.BENCH_MODEL || 'opencodex/minimax/MiniMax-M3.1-Flash'
const EFFORT = process.env.BENCH_EFFORT || 'max'
const MODEL_NAME = process.env.BENCH_MODEL_NAME || 'MiniMax-M3.1-Flash'
const TIMEOUT_MIN = Number(process.env.BENCH_TIMEOUT_MIN || 45)

const TASKS = [
  { slug: '01-palace', label: '궁전 모션 그래픽' },
  { slug: '02-hangang-city', label: '한강시 게임' },
  { slug: '03-model-intro', label: '소개 페이지' },
  { slug: '04-novel', label: '소설' },
  { slug: '05-hardware', label: '기판' },
]

const only = process.argv.slice(2).filter((a) => !a.startsWith('--attempt='))
const attempt = Number((process.argv.slice(2).find((a) => a.startsWith('--attempt=')) || '').split('=')[1] || 1)
const list = only.length ? TASKS.filter((t) => only.includes(t.slug)) : TASKS

const runsDir = path.join(root, 'runs')
fs.mkdirSync(runsDir, { recursive: true })

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => p.kill('SIGTERM'), TIMEOUT_MIN * 60 * 1000)
    p.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

for (const t of list) {
  const dir = path.join(root, 'work', attempt === 1 ? t.slug : `${t.slug}-a${attempt}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // 과제 폴더를 독립 git 루트로 만들어 "이 폴더만 수정한다" 제약이 실제로 enforced 되게 한다.
  spawnSync('git', ['init', '-q'], { cwd: dir })
  const raw = fs.readFileSync(path.join(root, 'prompts', `${t.slug}.txt`), 'utf8')
  const harness = fs.readFileSync(path.join(root, 'prompts', 'HARNESS.txt'), 'utf8')
  const prompt = (harness + '\n' + raw)
    .replaceAll('{{MODEL_NAME}}', MODEL_NAME)
    .replaceAll('{{EFFORT}}', EFFORT)
    .replaceAll('{{TASK_DIR}}', dir)
  const suffix = attempt === 1 ? '' : `-a${attempt}`
  const logFile = path.join(runsDir, `${t.slug}${suffix}.log`)
  fs.writeFileSync(
    path.join(runsDir, `${t.slug}${suffix}.meta.json`),
    JSON.stringify(
      {
        task: t.slug,
        attempt,
        label: t.label,
        model: MODEL,
        modelName: MODEL_NAME,
        effort: EFFORT,
        startedAt: new Date().toISOString(),
        workDir: dir,
        timeoutMin: TIMEOUT_MIN,
      },
      null,
      2
    ) + '\n'
  )
  const started = Date.now()
  process.stdout.write(`\n=== ${t.slug} attempt ${attempt} 시작 ${new Date().toISOString()}\n`)
  const { code, out } = await run(
    'opencode',
    ['run', '-m', `${MODEL}#${EFFORT}`, '--auto', '--title', `bench:${t.slug}`, prompt],
    { cwd: dir }
  )
  const secs = Math.round((Date.now() - started) / 1000)
  fs.writeFileSync(logFile, out)
  const meta = JSON.parse(fs.readFileSync(path.join(runsDir, `${t.slug}${suffix}.meta.json`), 'utf8'))
  meta.finishedAt = new Date().toISOString()
  meta.seconds = secs
  meta.exitCode = code
  meta.timedOut = secs >= TIMEOUT_MIN * 60
  fs.writeFileSync(path.join(runsDir, `${t.slug}${suffix}.meta.json`), JSON.stringify(meta, null, 2) + '\n')
  process.stdout.write(`=== ${t.slug} attempt ${attempt} 종료 code=${code} ${secs}s\n`)
}
