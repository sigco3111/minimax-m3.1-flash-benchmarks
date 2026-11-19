// 지정 과제 프롬프트로 모델을 1회 실행한다.
// 사용: node tools/run-one.mjs <workDirName> <promptFile> [timeoutMin] [attempt]
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = process.env.BENCH_MODEL || 'opencodex/minimax/MiniMax-M3.1-Flash'
const EFFORT = process.env.BENCH_EFFORT || 'max'
const MODEL_NAME = process.env.BENCH_MODEL_NAME || 'MiniMax-M3.1-Flash'

const [, , dirName, promptFile, timeoutMin = '40', attempt = '1'] = process.argv
const dir = path.join(root, 'work', dirName)
const prompt = fs
  .readFileSync(path.join(root, 'prompts', promptFile), 'utf8')
  .replaceAll('{{MODEL_NAME}}', MODEL_NAME)
  .replaceAll('{{EFFORT}}', EFFORT)
  .replaceAll('{{TASK_DIR}}', dir)

const runsDir = path.join(root, 'runs')
fs.mkdirSync(runsDir, { recursive: true })
const suffix = attempt === '1' ? '' : `-a${attempt}`
const metaFile = path.join(runsDir, `${dirName}${suffix}.meta.json`)
fs.writeFileSync(
  metaFile,
  JSON.stringify(
    {
      task: dirName,
      attempt: Number(attempt),
      model: MODEL,
      modelName: MODEL_NAME,
      effort: EFFORT,
      startedAt: new Date().toISOString(),
      workDir: dir,
      timeoutMin: Number(timeoutMin),
    },
    null,
    2
  ) + '\n'
)

const started = Date.now()
process.stdout.write(`=== ${dirName} attempt ${attempt} 시작 ${new Date().toISOString()}\n`)
const p = spawn('opencode', ['run', '-m', `${MODEL}#${EFFORT}`, '--auto', '--title', `bench:${dirName}`, prompt], {
  cwd: dir,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
p.stdout.on('data', (d) => (out += d))
p.stderr.on('data', (d) => (out += d))
const timer = setTimeout(() => p.kill('SIGTERM'), Number(timeoutMin) * 60 * 1000)
p.on('close', (code) => {
  clearTimeout(timer)
  const secs = Math.round((Date.now() - started) / 1000)
  fs.writeFileSync(path.join(runsDir, `${dirName}${suffix}.log`), out)
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  meta.finishedAt = new Date().toISOString()
  meta.seconds = secs
  meta.exitCode = code
  meta.timedOut = secs >= Number(timeoutMin) * 60
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n')
  process.stdout.write(`=== ${dirName} 종료 code=${code} ${secs}s\n`)
})
