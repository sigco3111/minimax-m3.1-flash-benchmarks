// 기판(05) 납품물 검증: 파일 구성 존재, CAD/STL, 펌웨어 소스, 인증정보 누출.
// 사용: node tools/check-hardware.mjs [대상 폴더]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.resolve(process.argv[2] || path.join(root, 'hardware'))
const checks = []
const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail })

const walk = (d, acc = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

if (!fs.existsSync(dir)) {
  add('hardware folder exists', false, dir)
} else {
  const files = walk(dir)
  const rel = files.map((f) => path.relative(dir, f))
  const has = (re) => rel.filter((f) => re.test(f))
  add('REQUIREMENTS.md present', has(/^REQUIREMENTS\.md$/i).length === 1, has(/^REQUIREMENTS\.md$/i))
  add('ARCHITECTURE.md present', has(/^ARCHITECTURE\.md$/i).length === 1, has(/^ARCHITECTURE\.md$/i))
  add('BOM.csv present', has(/BOM\.csv$/i).length === 1, has(/BOM\.csv$/i))
  add('wiring table or schematic present', has(/wiring|schematic|배선|회로/i).length > 0, has(/wiring|schematic|배선|회로/i))
  add('firmware sources present', has(/^firmware\//i).length > 0, has(/^firmware\//i).length)
  add('firmware build config present', has(/^firmware\/.*(Makefile|CMakeLists|platformio\.ini|\.mk|build)/i).length > 0, has(/^firmware\/.*(Makefile|CMakeLists|platformio\.ini|\.mk|build)/i))
  add('firmware source files present', has(/^firmware\/.*\.(c|cpp|h|hpp|ino|rs|py)$/i).length > 0, has(/^firmware\/.*\.(c|cpp|h|hpp|ino|rs|py)$/i))
  add('parametric CAD source present', has(/\.(scad|step|stp|fcstd|blend|cadquery)$/i).length > 0, has(/\.(scad|step|stp|fcstd|blend|cadquery)$/i))
  add('STL mesh present', has(/\.stl$/i).length > 0, has(/\.stl$/i))
  add('preview visualization present', has(/^preview\//i).length > 0, has(/^preview\//i).length)
  add('README.md present', has(/^README\.md$/i).length === 1, has(/^README\.md$/i))
  add('VERIFICATION.md present', has(/^VERIFICATION\.md$/i).length === 1, has(/^VERIFICATION\.md$/i))

  // STL 유효성: 바이너리/ASCII 헤더와 삼각형 수 확인
  const stls = files.filter((f) => /\.stl$/i.test(f))
  const stlInfo = stls.map((f) => {
    const buf = fs.readFileSync(f)
    const isBinary = buf.length >= 84 && buf.readUInt32LE(80) > 0 && (buf.length - 84) / 12 === buf.readUInt32LE(80)
    const triangles = isBinary ? buf.readUInt32LE(80) : (buf.toString('utf8').match(/facet normal/g) || []).length
    return { file: path.relative(dir, f), bytes: buf.length, triangles, valid: triangles > 0 && buf.length > 84 }
  })
  add('STL files are non-empty valid meshes', stlInfo.length > 0 && stlInfo.every((s) => s.valid), stlInfo)

  // CAD 원본에 치수 파라미터가 있는지
  const cad = files.filter((f) => /\.(scad|fcstd|cq|cadquery)$/i.test(f))
  add('CAD source contains dimensional parameters', cad.some((f) => /\d/.test(fs.readFileSync(f, 'utf8'))), cad.map((f) => path.relative(dir, f)))

  // 인증정보 누출 검사: 실제 리터럴 문자열 값이 박힌 경우만 잡는다.
  // (변수 전달·환경변수 조회·None 같은 전달 경로는 정상 코드가 아니라 누출이 아니다)
  const secretRe = /(api[_-]?key|secret|password|passwd|token|credential)\s*[:=]\s*["'][^"'\s]{8,}["']/gi
  const placeholder = /(your|changeme|example|placeholder|xxxx|redacted|<|\$\{|\{\{)/i
  const leaks = files.filter((f) => /\.(md|csv|txt|py|c|h|js|json|ini|toml|yaml|yml)$/i.test(f)).filter((f) => {
    try {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(secretRe)) {
        if (!placeholder.test(m[0])) return true
      }
      return false
    } catch { return false }
  })
  add('no credentials embedded in deliverables', leaks.length === 0, leaks.map((f) => path.relative(dir, f)))
}

const result = { dir: path.relative(root, dir), checks }
fs.mkdirSync(path.join(root, 'verification'), { recursive: true })
fs.writeFileSync(path.join(root, 'verification', 'hardware-checks.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (checks.some((c) => !c.pass)) process.exitCode = 1
