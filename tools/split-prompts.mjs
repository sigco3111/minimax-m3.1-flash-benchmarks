// ORIGINAL_PROMPTS.txt 에서 다섯 과제 원문을 그대로 잘라 prompts/ 에 쓴다.
// 원문 텍스트는 수정하지 않는다. 치환은 실행에 쓰는 사본에만 한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'ORIGINAL_PROMPTS.txt'), 'utf8')

const marker = '과제 원문'
const idx = src.indexOf(marker)
if (idx < 0) throw new Error('과제 원문 표식을 찾지 못함')
const body = src.slice(src.indexOf('\n', idx) + 1)

const TASKS = [
  { n: '01', key: 'palace', title: '궁전 모션 그래픽' },
  { n: '02', key: 'hangang-city', title: '한강시 게임' },
  { n: '03', key: 'model-intro', title: '소개 페이지' },
  { n: '04', key: 'novel', title: '소설' },
  { n: '05', key: 'hardware', title: '기판' },
]

// 과제 제목 줄로 경계를 자른다 (정확히 일치하는 줄 기준).
const lines = body.split('\n')
const starts = []
for (const t of TASKS) {
  const i = lines.findIndex((l) => l.trim() === t.title)
  if (i < 0) throw new Error(`과제 제목 못 찾음: ${t.title}`)
  starts.push({ ...t, line: i })
}
starts.sort((a, b) => a.line - b.line)

const parts = starts.map((s, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].line : lines.length
  return { ...s, text: lines.slice(s.line, end).join('\n').replace(/\n+$/, '') }
})

fs.mkdirSync(path.join(root, 'prompts'), { recursive: true })
for (const p of parts) {
  fs.writeFileSync(path.join(root, 'prompts', `${p.n}-${p.key}.txt`), p.text + '\n')
  console.log(`${p.n}-${p.key}.txt`, p.text.length, 'chars,', p.text.split('\n').length, 'lines')
}
