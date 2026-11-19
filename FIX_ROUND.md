# 발견 기록: 한강시 게임 알파벳 키 미작동 (수정 라운드)

## 요약

MiniMax-M3.1-Flash 가 2차 시도에서 만든 `hangang-city.html` 은 **알파벳 키가 전혀 동작하지 않았다.**
점프(Space)와 마우스 시점만 동작했고, 이동·주행·승하차·수배·은폐가 모두 불가능했다.

- 발견: 2026-11-19, 사용자 제보 ("캐릭터가 이동하지 못함")
- 영향 과제: 02 한강시 게임
- 상태: **수정 완료** (`prompts/02-hangang-city-fix.txt`, effort `max`)
  - 수정 내역: `game-src/src/50-main.js` — 물리 키 코드(`KeyW`…) 정규화 + `resolveKey(e.code, e.key)` 입력 경로
  - 검증: `node game-src/test/keys.mjs` → **33/33 통과** (수정 전 빌드로 돌리면 17/33, 실패 16항목)
  - 산출물: `hangang-city.html` (780KB, 단일 파일) — `node game-src/build.mjs hangang-city.html` 로 재생성
  - 상세: [HANGANG_README.md](HANGANG_README.md) · [WEB_VERIFICATION.md](WEB_VERIFICATION.md)

## 근본 원인

키 입력 정규화가 브라우저가 실제로 보내는 `e.code` 값을 처리하지 못했다.

```
입력 바인딩:  setKey(e.code || e.key, true)
정규화:      normalizeCode(c) → 소문자 → 'space'/'shift'/'ctrl'/'arrow' 만 특별 처리
매핑표:      KEY_ACTIONS = { 'w':'fwd', 'a':'left', 'd':'right', 's':'back', ... }
```

브라우저는 알파벳 키에 `e.code='KeyW'` 값을 준다.

1. `normalizeCode('KeyW')` → `'keyw'` (접두사 `Key` 제거 로직이 없음)
2. `KEY_ACTIONS['keyw']` → `undefined`
3. `setKey` 는 `if (!action) return;` 로 **조용히 종료**
4. `setKey(e.code || e.key, ...)` 에서 `e.code` 가 항상 truthy 이므로 `e.key`('w') 폴백에 도달하지 못함

결과적으로 `ArrowUp`·`Space`·`Shift` 만 동작한다.

## 측정 (실제 KeyboardEvent dispatch, 0.5초 입력 후 이동 거리)

수정 후 값은 `node game-src/test/keys.mjs` 로 헤드리스 크롬에 실제 키보드 이벤트
(CDP `Input.dispatchKeyEvent` + 합성 `KeyboardEvent`)를 넣어 재측정한 값이다.

| 키 | e.code | 2차 시도 | 수정 후 |
|---|---|---|---|
| W | `KeyW` | 0.000 ❌ | 1.598 ✅ |
| A | `KeyA` | 0.000 ❌ | 1.598 ✅ |
| D | `KeyD` | 0.000 ❌ | 1.598 ✅ |
| Shift | `ShiftLeft` | 0.009 ❌ | 6.87 ✅ (Shift+W 1초, 도보 alone 3.70) |
| ArrowUp | `ArrowUp` | 1.598 ✅ | 1.598 ✅ |
| Space | `Space` | 점프 ✅ | 점프 ✅ (y 0 → 1.05) |

Shift 은 이동 키가 아니라 가속(달리기·NOS) 키라서 "이동 거리"로 따로 재면 값이 0 에 가깝다.
2차 시도 표의 0.009 도 같은 이유(Shift 만 누른 상태의 잔여 이동)이며, 판정 기준은
**Shift+W 가 W 보다 빠른지** 로 잡았다(6.87 m vs 3.70 m, 1초 기준).

나머지 조작도 같은 스크립트로 확인했다(수정 전 → 수정 후):

| 조작 | 수정 전 | 수정 후 |
|---|---|---|
| `KeyF` 승하차 | 실패 | 탑승·하차 정상 |
| `KeyE` 수배 | 실패 | +1 (반복 keydown 은 중복 발동 안 함) |
| `KeyR` 은폐 | 실패 | `hidden = true` |
| `KeyC` 카메라 | 실패 | 거리 전환(7.6 ↔ 5.2) |
| `KeyM` 임무 패널 | 실패 | 패널 열림 |
| Space·방향키 스크롤 차단 | 동작 | 동작 유지 (문자키는 `Ctrl+F` 생존) |

## 왜 자동 검사가 놓쳤나 — 검사 공백의 원인

이 저장소의 `web-tests.mjs` 와 **모델이 만든 자체 smoke test 모두** 테스트 API
(`g.test.key('w', true)`) 만 사용했다. 이 API 는 정규화 함수를 건너뛰고
정규화된 키 문자열을 직접 넣기 때문에, **실제 브라우저가 보내는 `e.code` 경로를
한 번도 실행하지 않았다.**

두 검사 모두 같은 공백을 공유했고, 그래서 미션 3종 완주·주행·수배가 모두 "통과"로 기록되어 있었다.

### 대응

`web-tests.mjs` 의 02 과제 검사를 **실제 키보드 이벤트 경로**로 바꿨다.
이제 `test` API 우회 없이 `KeyboardEvent` 를 dispatch 하여 판단한다.

| 검사 | 판정 |
|---|---|
| real keyboard W moves the character | 이동 거리 > 0.5 |
| real keyboard A changes position | 이동 거리 > 0.1 |
| real keyboard D changes position | 이동 거리 > 0.1 |
| real keyboard ArrowUp moves the character | 이동 거리 > 0.5 |
| real keyboard Space jumps | y 증가 |
| real keyboard Shift boosts movement | 이동 거리 > 1.0 |
| real keyboard F enters a nearby car | `PLAYER.car` 존재 |

이 검사는 **고장 난 빌드에서 실패하고, 수정한 빌드에서 통과함을 별도로 확인**했다.
(고칠 대상이 아닌 체커를 그대로 두면 재발을 못 잡는다.)

### 수정 라운드에서 추가한 자체 검사 (`game-src/test/keys.mjs`)

저장소 검사에 더해, 과제 산출물에 실제 키보드 이벤트 전용 검사를 새로 넣었다.
`test` API 를 건너뛰고 브라우저가 실제로 보내는 키보드 이벤트를 두 경로로 넣는다.

| 입력 경로 | 방법 |
|---|---|
| 실제 브라우저 입력 | CDP `Input.dispatchKeyEvent` (`code`·`key`·`autoRepeat` 지정) |
| 합성 이벤트 | `window.dispatchEvent(new KeyboardEvent('keydown', {code, key}))` — code 경로와 key 전용 경로 |

검사 33항목: 알파벳 4키 이동·정지·Shift 달리기·F 승하차·E 수배·R 은폐·C 카메라·M 임무 패널·
방향키·Space 점프·키 반복 무시·Space/방향키 스크롤 차단·문자키 기본 동작 유지·
`window.__game` 계약 유지·런타임 예외 없음.

```
node game-src/test/keys.mjs                        # 수정 후 산출물 → 33/33 통과
node game-src/test/keys.mjs <수정 전 산출물.html>    # 결함 재현 → 17/33 (실패 16항목)
```

> 헤드리스 크롬은 창에 포커스가 없어 수식 키(Shift)를 처음 누르면 `window` blur 가 한 번 발생해
> 게임이 "키를 놓았다"고 처리한다. 검사 스크립트는 CDP `Emulation.setFocusEmulationEnabled` 로
> 실제 브라우저와 같은 포커스 상태를 만들어 측정한다. 실제 브라우저에서는 이 blur 가 발생하지 않는다.

## 수정 내용 (`game-src/src/50-main.js`)

1. **정규화 확장** — `KeyW`→`w`, `KeyA`→`a`, `Digit1`→`1`, `Numpad0`→`0`,
   `Space`→`' '`, `ShiftLeft`/`ShiftRight`→`shift`, `ControlLeft`→`ctrl`, `ArrowUp`→`arrowup`.
2. **입력 경로 분리** — `resolveKey(e.code, e.key)` 가 물리 키 `e.code` 를 먼저 보고,
   매핑이 없을 때만 `e.key` 로 대체한다(키보드 배치 무시, e.code 가 없는 환경 대비).
3. **기본 동작 방지 유지** — Space·방향키만 `preventDefault()`(키 반복 이벤트에서도 차단),
   문자키는 막지 않아 `Ctrl+F` 같은 브라우저 단축키가 살아 있다. `e.repeat` 는
   여전히 조작을 다시 발동시키지 않는다.
4. **계약 유지/확장** — `test.key()`/`test.press()` 가 `'KeyW'` 형태도 받고,
   `dbg.normalizeCode`/`dbg.resolveKey`/`dbg.KEY_ACTIONS` 로 매핑을 직접 확인할 수 있다.

부수 수정: `vendor/three.min.js` 가 r148 로 내려가 있어 빌드 재현성이 깨져 있던 것을
산출물에 실려 있던 r159 로 맞췄고, `build.mjs` 가 `vendor/` 위치를 두 곳(소스 폴더 옆/상위 폴더)에서 찾게 했다.

## 참고: 다른 모델의 구현

같은 저장소에 함께 있는 muse-spark-1.3 실행의 게임은 `key[e.code]` 로 키 상태를
직접 관리한다. `e.code` 를 일관되게 쓰는 패턴이므로 같은 버그가 없다.
MiniMax 실행에만 있는 결함이다.

## 기록 원칙

- 이 저장소는 **단일 시도 기준선**을 유지한다. 수정 라운드는 별도 attempt 로 기록하고
  `RESULTS.md` 에 시도 횟수를 남긴다.
- 수정 라운드는 동일 모델(effort `max`), 동일 원문 메타프롬프트에 **사용자 제보로 narrow 한 버그 리포트**를 붙여 실행했다. 프롬프트 원문은 `prompts/02-hangang-city-fix.txt` 에 그대로 있고,
  1차 산출물과 로그는 `attempts/` 에 보존된다.
