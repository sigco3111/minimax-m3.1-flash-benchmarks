# 기판(05) 결과물 검증

`hardware/` 산출물에 대해 **실제로 실행한** 검사입니다. 결과 원본은 `verification/hardware-checks.json`입니다.

## 검증 환경

| 항목 | 값 |
|---|---|
| 호스트 | macOS (arm64) |
| Python | 3.9 (표준 라이브러리만) |
| C++ 컴파일러 | Apple clang, `-std=c++11 -Wall -Wextra -Werror` |
| Arduino CLI | 1.6.0 |
| MCU 코어 | `rp2040:rp2040` 6.4.0 (Raspberry Pi Pico/RP2040/RP2350, Earle F. Philhower III) |
| 라이브러리 | Adafruit SSD1306 2.5.17, Adafruit GFX 1.13.0, Adafruit BusIO 1.17.4 |
| CAD | OpenSCAD 2021.01 |
| 대상 보드 | Adafruit QT Py RP2040 (`rp2040:rp2040:adafruit_qtpy`) |

## 모델이 실행했다고 기록한 것 vs. 이 저장소가 독립 확인한 것

모델의 `hardware/VERIFICATION.md`는 컴파일 출력을 그대로 인용합니다. 이 저장소는 그 주장을 **독립적으로 재실행**해 확인했습니다.

| 항목 | 모델 기록 | 이 저장소의 재검증 |
|---|---|---|
| 펌웨어 컴파일 | `Sketch uses 73412 bytes` | **동일하게 재현**. `arduino-cli compile --warnings all` 통과, 경고 0건, `.uf2`(180,736 B)·`.elf` 생성 |
| 컴파일 산출물 재현성 | (미기재) | **UF2 해시가 모델이 만든 것과 동일** (`b14e8e20…`). 같은 소스·같은 툴체인에서 바이트 단위로 재현됨 |
| 호스트 단위 테스트 | 통과 | **재실행 통과** (`make -C firmware/test test`) |
| Python 호스트 테스트 | 14건 통과 | **재실행 14/14 통과** (`python3 -m unittest discover -s host/tests`) |
| 케이스 STL | OpenSCAD로 렌더 | **재렌더 성공**. 정점 집합이 납품된 STL과 완전히 동일(8,028 / 7,716 정점). 바이너리 해시는 삼각형 패싯 순서 차이로만 다름 |
| 형상 기하 자기검사 | 통과 | **재실행 통과** (`python3 enclosure/check_model.py`) — 나사 피스·볼트 홀 위치, 간섭(OLED 유리/패널/보드 스택) |
| 인증정보 미포함 | 없음 | **검사 통과** (환경변수 조회 방식이며 리터럴 값 없음) |

재검증 때 생성된 컴파일 산출물(`.uf2`·`.elf`·`.map`)과 테스트 실행 파일은 저장소에 넣지 않았습니다. `firmware/build.sh` 로 언제든 다시 만들 수 있습니다.

## 실행한 검사 결과

<!--HW_CHECKS_TABLE:START-->
| 검사 | 결과 |
|---|---|
| REQUIREMENTS.md present | 통과 |
| ARCHITECTURE.md present | 통과 |
| BOM.csv present | 통과 |
| wiring table or schematic present | 통과 |
| firmware sources present | 통과 |
| firmware build config present | 통과 |
| firmware source files present | 통과 |
| parametric CAD source present | 통과 |
| STL mesh present | 통과 |
| preview visualization present | 통과 |
| README.md present | 통과 |
| VERIFICATION.md present | 통과 |
| STL files are non-empty valid meshes | 통과 |
| CAD source contains dimensional parameters | 통과 |
| no credentials embedded in deliverables | 통과 |
<!--HW_CHECKS_TABLE:END-->

| 검사 | 결과 |
|---|---|
| REQUIREMENTS.md present | 통과 |
| ARCHITECTURE.md present | 통과 |
| BOM.csv present | 통과 |
| wiring table or schematic present | 통과 |
| firmware sources present | 통과 |
| firmware build config present | 통과 |
| firmware source files present | 통과 |
| parametric CAD source present | 통과 |
| STL mesh present | 통과 |
| preview visualization present | 통과 |
| README.md present | 통과 |
| VERIFICATION.md present | 통과 |
| STL files are non-empty valid meshes | 통과 |
| CAD source contains dimensional parameters | 통과 |
| no credentials embedded in deliverables | 통과 |

## 산출물 구성

| 파일 | 내용 |
|---|---|
| `REQUIREMENTS.md` | 요구사항, 전원 예산, USB 전류 요구 근거 |
| `ARCHITECTURE.md` | 통신 구조, 상태 머신, 핀 배정 |
| `BOM.csv` | 부품 목록 + 제조사 공식 출처 링크 |
| `WIRING.md` | 배선표 (핀 → 부품 → GPIO/전원) |
| `SCHEMATIC.svg` | 회로도 (가독성 있는 벡터 도면) |
| `firmware/` | RP2040 펌웨어 소스, `build.sh`, `setup.sh`(툴체인 고정 설치), `test/` |
| `host/` | USB 브리지 앱, OBS 웹소켓 클라이언트, 장치 시뮬레이터, 테스트 |
| `enclosure/` | `rec1_case.scad` 파라메트릭 원본, `dims.scad`, STL 2종, 기하 자기검사 |
| `preview/` | 1920×1080 로컬 실행 시각화 (조립/분해 슬라이더, 기판 배치, 화면 시뮬레이션) |
| `README.md` | 조립·플래시·실행 절차 |
| `VERIFICATION.md` | 모델이 실행한 검증과 로그, 한계 |

`tools/make_schematic.py`는 `SCHEMATIC.svg`를 재생성하는 스크립트입니다. 회로도는 단순 이미지가 아니라 핀 연결을 표현한 벡터 도면입니다.

## 미검증 항목 — 실물 없이는 확인할 수 없음

모델의 `hardware/VERIFICATION.md`에 열거된 인수 테스트 항목이며, 이 저장소도 동일하게 **검증하지 않았다**고 밝힙니다.

- UF2 이미지가 실제 보드에서 부팅하지 않는지
- OLED가 코드가 가정하는 주소/버스로 실제 응답하는지
- 버튼 디바운스·중복 명령 억제가 물리적 스위치에서 기대대로 동작하는지
- USB 연결/재연결 시 브리지와 디바이스의 실제 협상(Handshake)
- 표시등이 실제 OBS 녹화 상태를 따라가는지 (호스트 앱은 모의 서버로만 검증)
- 케이스 조립 시 포트·버튼·화면의 실제 간섭과 공차
- 전원 예산 실측(전류계 측정)
- 케이스 조립·플래시 후 인수 테스트

`preview/`는 **시뮬레이션**입니다. CAD 치수에서 그린 도해이며, 만들어진 실물을 촬영한 것이 아닙니다. 화면 안에도 그렇게 표시되어 있습니다.
