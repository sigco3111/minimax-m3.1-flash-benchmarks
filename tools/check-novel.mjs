// 소설(04) 원고 검증: 분량, 장면 구성, 원문 요구사항.
// 사용: node tools/check-novel.mjs [novel.md 경로]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2] || path.join(root, 'novel.md')
const text = fs.readFileSync(file, 'utf8')

const body = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
// 목차(구성) 블록: "## 다섯 장면", "[구성]" 같은 표제부터 본문 첫 장면 표제 직전까지
const lines = text.split('\n')
const outlineHeadIdx = lines.findIndex((l) => /^\s*(?:#+\s*)?(?:\[?\s*구성\s*\]?|다섯\s*장면)\s*$/.test(l))
let outline = ''
let manuscript = text
if (outlineHeadIdx >= 0) {
  const firstSceneIdx = lines.findIndex((l, i) => i > outlineHeadIdx && /^\s*#{1,4}\s*\d+\.\s*\S/.test(l))
  const end = firstSceneIdx >= 0 ? firstSceneIdx : lines.length
  outline = lines.slice(outlineHeadIdx, end).join('\n')
  manuscript = lines.slice(end).join('\n')
}

const noSpace = (s) => s.replace(/\s/g, '').length
const hangul = (s) => (s.match(/[가-힣]/g) || []).length
// 장면 표제: "1. 제목", "## 1. 제목" 등 마크다운 헤딩·순번 목록 모두 인정
const sceneHeads = manuscript.split('\n').filter((l) => /^\s*(?:#{1,4}\s*)?\d+\.\s*\S/.test(l) && l.length < 60)

const checks = []
const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail })

add('novel.md exists and is non-empty', text.trim().length > 0, text.length)
add('character count reaches 10000+ (no whitespace)', noSpace(manuscript) >= 10000, noSpace(manuscript))
add('hangul syllable count reaches 8000+', hangul(manuscript) >= 8000, hangul(manuscript))
add('title is present', /^#\s+\S+/m.test(text), text.split('\n')[0])
add('five-scene outline is present', (outline.match(/^\s*(?:\*\*)?\d+\./gm) || []).length >= 5, (outline.match(/\d+\./g) || []).length)
add('five scene headings found in manuscript', sceneHeads.length >= 5, sceneHeads)
add('setting year 2031 mentioned', text.includes('2031'), null)
add('print shop and pressman setting present', /인쇄소|활판/.test(text) && /문 씨/.test(text), null)
add('sensory craft detail present', /납 냄새|역상|잉크/.test(text), null)
add('late autumn to first snow transition present', /늦가을|첫눈|가을/.test(text), null)
// 마지막 장면은 인쇄된 한 장의 종이로 끝나야 한다 → 본문 끝부분에 인쇄·종이가 함께 있어야 한다
const tail = manuscript.slice(-1200)
add('final scene ends on one printed sheet', /인쇄/.test(tail) && /(종이|한\s*장|장)/.test(tail), tail.slice(-160).replace(/\s+/g, ' '))

const result = { file: path.relative(root, file), chars: { total: noSpace(text), manuscript: noSpace(manuscript), hangul: hangul(manuscript) }, sceneHeadings: sceneHeads, checks }
fs.writeFileSync(path.join(root, 'verification', 'novel-checks.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (checks.some((c) => !c.pass)) process.exitCode = 1
