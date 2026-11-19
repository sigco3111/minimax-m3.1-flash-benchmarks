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
| 01 palace | `window.__palace.stats` / `.seek(t)` | 그룹 합계 = 실측 브릭 수, 브릭 규모, 파트 그룹 5종, 치수 3축, 타임라인 seek, 페이지 오류 |
| 02 hangang-city | `window.__game.state` / `.test.*` | 걷기·점프·중력, 차량 승하차(F)·가속, 미션 3종 완주, 수배 감소, 낮/밤 전환, 페이지 오류 |
| 03 model-intro | `window.__intro.state` | 390px 가로 넘침 없음, 입자 수, `prefers-reduced-motion` 감지, 페이지 오류 |

게임 검사는 `test.step()`에 의한 **디지털 기능 검사**입니다. 실제 키보드를 눌러 수동 완주한 결과가 아닙니다.

## 실행한 검사 결과

<!--WEB_CHECKS_TABLE:START-->
| 과제 | 검사 | 결과 | 비고 |
|---|---|---|---|
| palace | sum of group counts equals actual brick records | 통과 | {"sum":1185,"bricks":1185} |
| palace | brick count is non-trivial | 통과 | 1185 |
| palace | five part groups present | 통과 | ["terrace","pillars","brackets","roof","courtyard"] |
| palace | dimensions are measured values | 통과 | [25.6,23.04,26.4] |
| palace | generation time is measured | 통과 | 41.8 |
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
| hangang-city | walking input advances the simulation | 통과 | 2.9333333333333265 |
| hangang-city | state stays serialisable after input | 통과 | 96 |
| hangang-city | jump input does not fault the game | 통과 | - |
| hangang-city | begin("delivery") starts the delivery mission | 통과 | "delivery" |
| hangang-city | begin("escape") starts the escape mission | 통과 | "escape" |
| hangang-city | begin("roof") starts the rooftop mission | 통과 | "roof" |
| hangang-city | wanted level is a number | 통과 | 2 |
| hangang-city | setTime(90) changes day/night state | 통과 | {"before":99,"after":99} |
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
| 근정전 | [`palace-verify/check.mjs`](palace-verify/check.mjs) · `eval.mjs` · `px.py` | `window.__palace` 계약 확인, 지정 시각 스크린샷, 픽셀 분석 |
| 소개 페이지 | (모델이 작업 중 사용) | — |
| 기판 미리보기 | `hardware/preview/` 자체 실행 | 1920×1080 캡처, 콘솔 오류 0건(이 저장소에서 확인) |

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
- **다양한 기기·브라우저**: Chrome 하나, macOS 하나만 검사했습니다.
- **화면 품질**: 사람이 판단할 영역입니다. 이 저장소는 기능 충족을 자동 검사하고, 화면 품질은 스크린샷으로 남겨 직접 보게 합니다.
- **CDN 의존성**: three.js·GSAP은 CDN에서 읽습니다. 인터넷이 끊기면 세 웹 과제는 동작하지 않습니다(하드웨어 미리보기는 로컬 전용).
