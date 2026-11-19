// 검증 결과와 실행 메타에서 요약표를 만든다. 손으로 숫자를 쓰지 않는다.
// 사용: node tools/report.mjs  → RESULTS.md (+ README/검증문서 표 갱신)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)

const TASKS = [
  { slug: '01-palace', label: '궁전 모션 그래픽', page: 'palace' },
  { slug: '02-hangang-city', label: '한강시 게임', page: 'hangang-city' },
  { slug: '03-model-intro', label: '소개 페이지', page: 'model-intro' },
  { slug: '04-novel', label: '소설', page: null },
  { slug: '05-hardware', label: '기판', page: null },
]

// 각 과제의 대표 시도: attempts/ 에 보존된 이전 시도보다 최신 시도 하나를 쓴다.
function latestRun(slug) {
  const cands = []
  for (const f of fs.readdirSync(path.join(root, 'runs'))) {
    if (!f.endsWith('.meta.json')) continue
    const m = read(path.join(root, 'runs', f))
    if (m && m.task === slug) cands.push(m)
  }
  if (!cands.length) return null
  return cands.sort((a, b) => (a.attempt || 1) - (b.attempt || 1))[cands.length - 1]
}
function allRuns(slug) {
  return fs
    .readdirSync(path.join(root, 'runs'))
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => read(path.join(root, 'runs', f)))
    .filter((m) => m && m.task === slug)
    .sort((a, b) => (a.attempt || 1) - (b.attempt || 1))
}

const web = read(path.join(root, 'web-checks.json')) || []
const novel = read(path.join(root, 'verification', 'novel-checks.json'))
const hw = read(path.join(root, 'verification', 'hardware-checks.json'))

const rows = []
for (const t of TASKS) {
  const meta = latestRun(t.slug)
  const history = allRuns(t.slug)
  let checks = null
  if (t.page) checks = web.find((x) => x.page === t.page)?.checks || null
  else if (t.page === null && t.slug === '04-novel') checks = novel?.checks || null
  else if (t.slug === '05-hardware') checks = hw?.checks || null
  const pass = checks ? checks.filter((c) => c.pass).length : null
  rows.push({
    label: t.label,
    task: t.label,
    slug: t.slug,
    model: meta?.modelName ?? '-',
    effort: meta?.effort ?? '-',
    started: meta?.startedAt ?? '-',
    minutes: meta?.seconds != null ? (meta.seconds / 60).toFixed(1) : '-',
    exit: meta?.exitCode ?? '-',
    attempts: history.length,
    retried: history.length > 1,
    pass,
    total: checks ? checks.length : 0,
    failed: checks ? checks.filter((c) => !c.pass).map((c) => c.name) : [],
  })
}

const out = []
out.push('# 실행·검증 요약\n')
out.push('아래 수치는 모두 `runs/*.meta.json`과 `web-checks.json`·`verification/*.json`에서 자동 생성했습니다.\n')
out.push('| 과제 | 모델 | effort | 시작(UTC) | 소요(분) | 종료코드 | 시도 | 검사 통과 | 실패 항목 |')
out.push('|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  out.push(
    `| ${r.task} | ${r.model} | ${r.effort} | ${r.started} | ${r.minutes} | ${r.exit} | ${r.retried ? r.attempts + '회' : '1회'} | ${r.pass ?? '-'}/${r.total || '-'} | ${r.failed.length ? r.failed.join(', ') : '-'} |`
  )
}
out.push('')

// 재시도 기록: 어떤 과제가 하네스 시간 제한 때문에 다시 돌았는지
const retried = rows.filter((r) => r.retried)
if (retried.length) {
  out.push('## 재시도 기록\n')
  out.push('| 과제 | 시도 | 시작(UTC) | 소요(분) | 종료코드 | 사유 |')
  out.push('|---|---|---|---|---|---|')
  for (const r of retried) {
    for (const m of allRuns(r.slug)) {
      out.push(
        `| ${r.task} | ${m.attempt} | ${m.startedAt} | ${m.seconds != null ? (m.seconds / 60).toFixed(1) : '진행 중'} | ${m.exitCode ?? '진행 중'} | ${m.note ?? (m.attempt === 1 ? '1차 시도' : '시간 제한 연장 후 재실행')} |`
      )
    }
  }
  out.push('')
}
fs.writeFileSync(path.join(root, 'RESULTS.md'), out.join('\n'))

// 표를 문서에 끼워 넣는다(수치 수동 입력 금지).
// 마커는 <!--X:START--> ... <!--X:END--> 쌍으로 남겨 두고 그 사이만 교체한다.
function fill(file, name, lines) {
  const p = path.join(root, file)
  if (!fs.existsSync(p)) return
  const md = fs.readFileSync(p, 'utf8')
  const start = `<!--${name}:START-->`
  const end = `<!--${name}:END-->`
  const i = md.indexOf(start)
  const j = md.indexOf(end)
  if (i < 0 || j < 0) return
  const next = md.slice(0, i + start.length) + '\n' + lines.join('\n') + '\n' + md.slice(j)
  if (next !== md) fs.writeFileSync(p, next)
}

fill(
  'README.md',
  'RESULTS_TABLE',
  out.slice(out.findIndex((l) => l.startsWith('| 과제 |')), out.findIndex((l) => l.startsWith('## 재시도')))
)

const webLines = ['| 과제 | 검사 | 결과 | 비고 |', '|---|---|---|---|']
for (const page of web) {
  for (const c of page.checks) {
    webLines.push(
      `| ${page.page} | ${c.name} | ${c.pass ? '통과' : '**실패**'} | ${c.detail === undefined ? '-' : String(JSON.stringify(c.detail)).slice(0, 120)} |`
    )
  }
}
fill('WEB_VERIFICATION.md', 'WEB_CHECKS_TABLE', webLines)

if (hw) {
  const hwLines = ['| 검사 | 결과 |', '|---|---|']
  for (const c of hw.checks) hwLines.push(`| ${c.name} | ${c.pass ? '통과' : '**실패**'} |`)
  fill('HARDWARE_VERIFICATION.md', 'HW_CHECKS_TABLE', hwLines)
}

if (novel) {
  const nLines = ['| 검사 | 결과 |', '|---|---|']
  for (const c of novel.checks) nLines.push(`| ${c.name} | ${c.pass ? '통과' : '**실패**'} |`)
  fill('NOVEL_VERIFICATION.md', 'NOVEL_CHECKS_TABLE', nLines)
  fill(
    'NOVEL_VERIFICATION.md',
    'NOVEL_CHARS',
    [
      '| 항목 | 값 |',
      '|---|---|',
      `| 공백 제외 총 글자 | ${novel.chars.total.toLocaleString()} |`,
      `| 공백 제외 본문 글자 | ${novel.chars.manuscript.toLocaleString()} |`,
      `| 한글 음절 수 | ${novel.chars.hangul.toLocaleString()} |`,
    ]
  )
}

console.log(out.join('\n'))
