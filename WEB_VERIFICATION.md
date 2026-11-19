# 웹 결과물 검증

이 저장소의 웹 과제 산출물에 대해 **실제로 실행한** 검사입니다. 결과 원본은 `web-checks.json`과 `verification/*.png`입니다. 실행하지 않은 항목은 "미검증"으로 적었습니다.

## 검증 환경

| 항목 | 값 |
|---|---|
| 브라우저 | Google Chrome (headless), puppeteer-core 25.x |
| 렌더링 | SwiftShader 소프트웨어 WebGL (`--use-angle=swiftshader`) |
| 뷰포트 | 1280×720 (기능 검사), 1920×1080 (스크린샷) |
| 실행 명령 | `npm test` → `web-tests.mjs` |

소프트웨어 WebGL에서 측정한 값입니다. 실제 GPU 성능이나 60fps 보장은 이 검사에서 나오지 않습니다.

## 검사 계약

과제마다 모델이 노출해야 하는 인터페이스(`prompts/HARNESS.txt` 3절)를 그대로 검사합니다. 계약 이름이 하나라도 다르면 해당 검사는 실패로 기록됩니다.

| 과제 | 노출 인터페이스 | 검사한 것 |
|---|---|---|
| 01 palace | `window.__palace.stats` / `.seek(t)` | 그룹 합계 = 실측 브릭 수, 브릭 규모, 파트 그룹 5종, 치수 3축, 생성 시간, 타임라인 seek, 페이지 오류 |
| 02 hangang-city | `window.__game.state` / `.test.*` | test 훅 6종 존재, state 5종 존재, **실제 키보드 이벤트**로 W/A/D/ArrowUp 이동·Space 점프·Shift 달리기·F 승하차, 미션 3종 시작, 수배 값, 낮/밤 전환, 페이지 오류 |
| 03 model-intro | `window.__intro.state` | 390px 가로 넘침 없음, 입자 수, 스크롤 진행 추적, `prefers-reduced-motion` 감지, 페이지 오류 |

게임 검사는 `test.step()`에 의한 **디지털 기능 검사**입니다. 실제 키보드를 눌러 수동 완주한 결과가 아닙니다.

## 실제 키보드 이벤트 검사 (02 과제)

2차 시도에서 알파벳 키가 동작하지 않는 결함이 사용자 제보로 확인됐습니다.
원인은 `normalizeCode()` 가 브라우저가 보내는 `KeyboardEvent.code`(`KeyW` 등)를 처리하지 못한 것이었고,
**테스트 API(`test.key('w')`)만 호출하던 검사에서는 이 결함이 보이지 않았습니다.**

그래서 02 과제 검사는 이제 합성 `KeyboardEvent` 를 실제로 dispatch 해서 판정합니다.
검사 자체를 검증하기 위해, 고장 난 빌드에서 실패하고 수정한 빌드에서 통과함을 각각 확인했습니다.

| 검사 | 판정 |
|---|---|
| real keyboard W moves the character | 이동 거리 > 0.5 |
| real keyboard A changes position | 이동 거리 > 0.1 |
| real keyboard D changes position | 이동 거리 > 0.1 |
| real keyboard ArrowUp moves the character | 이동 거리 > 0.5 |
| real keyboard Space jumps | y 증가 |
| real keyboard Shift boosts movement | 이동 거리 > 1.0 |
| real keyboard F enters a nearby car | 차량에 탑승 |

모델도 같은 취지에서 CDP `Input.dispatchKeyEvent` 를 쓰는 자체 검사를 함께 남겼습니다.
→ [`game-src/test/keys.mjs`](game-src/test/keys.mjs) (33/33 통과)

상세한 결함 분석과 수정 경위는 [FIX_ROUND.md](FIX_ROUND.md) 에 있습니다.
(단, 2차 시도에서 발견된 키보드 입력 결함은 아래 "키보드 입력 재검증" 에서 실제 키보드 이벤트로 확인했다.)

## 실행한 검사 결과

<!--WEB_CHECKS_TABLE:START-->
| 과제 | 검사 | 결과 | 비고 |
|---|---|---|---|
| palace | sum of group counts equals actual brick records | 통과 | {"sum":1185,"bricks":1185} |
| palace | brick count is non-trivial | 통과 | 1185 |
| palace | five part groups present | 통과 | ["terrace","pillars","brackets","roof","courtyard"] |
| palace | dimensions are measured values | 통과 | [25.6,23.04,26.4] |
| palace | generation time is measured | 통과 | 28.9 |
| palace | seek moves the timeline | 통과 | {"seekMovesTimeline":true,"at3":3,"at20":20} |
| palace | no page errors | 통과 | [] |
| model-intro | no horizontal overflow at 390px | 통과 | - |
| model-intro | particle field is populated | 통과 | 20000 |
| model-intro | scroll progress is tracked | 통과 | 0 |
| model-intro | reduced motion preference detected | 통과 | - |
| model-intro | no page errors | 통과 | [] |
| hangang-city | test.key hook exists | 통과 | - |
| hangang-city | test.press hook exists | 통과 | - |
| hangang-city | test.step hook exists | 통과 | - |
| hangang-city | test.teleport hook exists | 통과 | - |
| hangang-city | test.begin hook exists | 통과 | - |
| hangang-city | test.setTime hook exists | 통과 | - |
| hangang-city | state exposes wanted/mission/completed/elapsed/fps | 통과 | ["wanted","mission","completed","elapsed","fps"] |
| hangang-city | real keyboard W moves the character | 통과 | {"distance":1.5983333333334429} |
| hangang-city | real keyboard A changes position | 통과 | {"distance":1.6191427205738902} |
| hangang-city | real keyboard D changes position | 통과 | {"distance":1.0870073474869992} |
| hangang-city | real keyboard ArrowUp moves the character | 통과 | {"distance":1.6194235238418324} |
| hangang-city | real keyboard Space jumps | 통과 | {"y0":0,"y1":1.0499999999999996} |
| hangang-city | real keyboard Shift boosts movement | 통과 | {"distance":5.049835296152839} |
| hangang-city | real keyboard F enters a nearby car | 통과 | - |
| hangang-city | begin("delivery") starts the delivery mission | 통과 | "delivery" |
| hangang-city | begin("escape") starts the escape mission | 통과 | "escape" |
| hangang-city | begin("roof") starts the rooftop mission | 통과 | "roof" |
| hangang-city | wanted level is a number | 통과 | 2 |
| hangang-city | setTime(90) changes day/night state | 통과 | - |
| hangang-city | no page errors | 통과 | [] |
<!--WEB_CHECKS_TABLE:END-->

수치는 `web-checks.json`에서 직접 읽습니다.

| 과제 | 검사 | 결과 | 비고 |
|---|---|---|---|
| palace | sum of group counts equals actual brick records | 통과 | {"sum":1185,"bricks":1185} |
| palace | brick count is non-trivial | 통과 | 1185 |
| palace | five part groups present | 통과 | ["terrace","pillars","brackets","roof","courtyard"] |
| palace | dimensions are measured values | 통과 | [25.6,23.04,26.4] |
| palace | no page errors | 통과 | [] |
| model-intro | no horizontal overflow at 390px | 통과 | - |
| model-intro | particle field is populated | 통과 | 20000 |
| model-intro | reduced motion preference detected | 통과 | - |
| model-intro | no page errors | 통과 | [] |

## 스크린샷

`verification/`에 저장했습니다.

- `palace-assembly.png` … `palace-stats.png` — 32초 타임라인 7개 시점(바운딩 박스·와이어프레임·지붕만·결합부 경고·보강·인벤토리·통계)
- `game-night-verified.png` — 야간 조명 상태
- `intro-stage-0.png` … `intro-stage-5.png` — 스크롤 6장면
- `intro-mobile-verified.png` — 390×844 모바일

## 모델이 만든 자체 검사 (별도)

각 과제에는 모델이 직접 만든 검증 스크립트가 함께 있습니다. 위 표는 이 저장소가 독립적으로 만든 검사이고, 아래는 모델이 만든 쪽입니다.

| 과제 | 스크립트 | 확인 범위 |
|---|---|---|
| 한강시 | [`game-src/test/smoke.mjs`](game-src/test/smoke.mjs) | 걸음·달리기·점프(1.05 m)·차량 승하차·가속 61.8 km/h·드리프트(측정 3.85)·수배 1→3·순찰 추적(108.5→5.6 m)·미션 3종 완주·낮/노을/밤·AI 차량 26대·드로우콜 40 |
| 한강시 | [`game-src/test/keys.mjs`](game-src/test/keys.mjs) | **실제 키보드 이벤트**로 W/A/S/D 이동 1.598 m·Shift 달리기 6.87 m·F 승하차·E 수배·R 은폐·C 카메라·M 임무 패널·방향키·Space 점프·키 반복 무시·Space/방향키 스크롤 차단 — 33/33 통과 |
| 근정전 | [`palace-verify/check.mjs`](palace-verify/check.mjs) · `eval.mjs` · `px.py` | `window.__palace` 계약 확인, 지정 시각 스크린샷, 픽셀 분석 |
| 소개 페이지 | (모델이 작업 중 사용) | — |
| 기판 미리보기 | `hardware/preview/` 자체 실행 | 1920×1080 캡처, 콘솔 오류 0건(이 저장소에서 확인) |

### 키보드 입력 재검증 (2차 시도 결함)

한강시 게임은 2차 시도에서 "캐릭터가 이동하지 않음(점프·마우스 외 컨트롤 불가)"으로 보고되었다.
원인은 입력 정규화 함수가 브라우저가 실제로 보내는 `KeyboardEvent.code`(`KeyW` 등)를 처리하지 못해서였고,
`src/50-main.js` 의 정규화·입력 경로를 고쳐 해결했다. 상세는
[`HANGANG_README.md`](HANGANG_README.md) 의 "키보드 입력 결함 수정" 참고.

검증 방법: 헤드리스 크롬에 CDP `Input.dispatchKeyEvent`(브라우저가 실제로 보내는 키보드 이벤트)와
`window.dispatchEvent(new KeyboardEvent(...))`(code 경로·key 전용 경로) 두 경로로 넣고,
`test.step()` 으로 시뮬레이션을 0.5초 진행시켜 이동 거리와 상태 변화를 잰다.

```
node game-src/test/keys.mjs                       # 현재 산출물 검사
node game-src/test/keys.mjs <수정전 산출물.html>    # 결함 재현용(수정 전 빌드는 17/33)
```

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| `KeyW` / `KeyA` / `KeyS` / `KeyD` 이동 | 0.000 m | 1.598 m |
| `ShiftLeft`+`KeyW` | 0.000 m | 6.87 m |
| `KeyF` 승하차 / `KeyE` 수배 / `KeyR` 은폐 / `KeyC` 카메라 / `KeyM` 임무 패널 | 동작 안 함 | 모두 동작 |
| `ArrowUp` 이동 / `Space` 점프 | 동작 | 동작 유지 |
| 검사 결과 | 17/33 | **33/33** |

한강시 smoke test를 이 저장소에서 재실행한 결과(마지막 실행):

```
walk: dz -5.1 / speed 3.5      run: 10.97 m      jump: y 1.05 → landed 0
enter: inCar true              drive: 61.8 km/h   drift: maxLat 3.85, 25.2 km/h
wanted: 1 → 2 → 3, police 3    hide: hidden true
delivery: completed            escape: completed  roof: reached 7, completed
time: day 0 / dusk 0.76 / night 1
ai: 26 cars, maxDist 928       police: 108.5 → 5.6
perf: 40 draw calls, 93,782 tris, 13 textures
console logs 0 · errors 0
```

## 미검증 항목

- **60fps**: 목표이지 실측 결과가 아닙니다. SwiftShader 소프트웨어 렌더링에서 나온 fps는 하드웨어 성능과 무관합니다.
- **실제 브라우저 입력**: 키보드·마우스 실입력 대신 테스트 훅으로 상태를 전진시켰습니다.
  (단, 한강시의 알파벳 키 결함은 CDP `Input.dispatchKeyEvent` 로 실제 키보드 이벤트를 넣어 확인했다 — 위 "키보드 입력 재검증")
- **다양한 기기·브라우저**: Chrome 하나, macOS 하나만 검사했습니다.
- **화면 품질**: 사람이 판단할 영역입니다. 이 저장소는 기능 충족을 자동 검사하고, 화면 품질은 스크린샷으로 남겨 직접 보게 합니다.
- **CDN 의존성**: 소개 페이지의 GSAP/ScrollTrigger 만 CDN에서 읽습니다. 한강시·근정전·소설은 로컬 파일만으로 동작합니다.
