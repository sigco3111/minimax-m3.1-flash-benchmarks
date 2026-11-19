# 소설(04) 원고 검증

`novel.md` 원고에 대해 **실제로 실행한** 검사입니다. 결과 원본은 `verification/novel-checks.json`입니다.

## 검사 항목

원문 메타프롬프트의 소설 과제 요구사항을 그대로 검사 항목으로 옮겼습니다.

| 검사 | 근거 |
|---|---|
| 분량 1만 자 이상 (공백 제외) | "분량 원고지 60매 안팎(약 1만 2천 자)" |
| 한글 음절 8천 자 이상 | 같은 요구 |
| 제목 존재 | "먼저 제목과 다섯 장면의 구성을 짧게 제시하고" |
| 다섯 장면 구성 제시 | "다섯 장면의 구성" |
| 본문 다섯 장면 표제 | "이어서 본문을 끝까지 쓴다" |
| 2031년 배경 | "2031년 서울" |
| 을지로 인쇄소·문 씨 | "폐업을 앞둔 을지로 인쇄소. 70대 활판 인쇄공 '문 씨'" |
| 조판 손의 감각(납 냄새·역상·잉크) | "활자를 고르고 조판하는 손의 감각을 구체적으로" |
| 늦가을 → 첫눈 계절 전환 | "을지로 골목의 소리와 계절(늦가을→첫눈)" |
| 마지막 장면이 인쇄된 한 장 | "마지막 장면은 인쇄된 한 장의 종이로 끝낸다" |

**정성 항목의 한계**: 위 항목은 문자열 존재 여부만 확인합니다. 대사량, 감상적 표현 배제, 주문자 정체를 끝까지 확정하지 않는지 같은 조건은 자동 검사로 판정할 수 없어 읽어야 합니다.

## 실행한 검사 결과

<!--NOVEL_CHECKS_TABLE:START-->
| 검사 | 결과 |
|---|---|
| novel.md exists and is non-empty | 통과 |
| character count reaches 10000+ (no whitespace) | **실패** |
| hangul syllable count reaches 8000+ | **실패** |
| title is present | 통과 |
| five-scene outline is present | 통과 |
| five scene headings found in manuscript | 통과 |
| setting year 2031 mentioned | 통과 |
| print shop and pressman setting present | 통과 |
| sensory craft detail present | 통과 |
| late autumn to first snow transition present | 통과 |
| final scene ends on one printed sheet | 통과 |
<!--NOVEL_CHECKS_TABLE:END-->

| 검사 | 결과 |
|---|---|
| novel.md exists and is non-empty | 통과 |
| character count reaches 10000+ (no whitespace) | **실패** |
| hangul syllable count reaches 8000+ | **실패** |
| title is present | 통과 |
| five-scene outline is present | 통과 |
| five scene headings found in manuscript | 통과 |
| setting year 2031 mentioned | 통과 |
| print shop and pressman setting present | 통과 |
| sensory craft detail present | 통과 |
| late autumn to first snow transition present | 통과 |
| final scene ends on one printed sheet | 통과 |

## 분량

<!--NOVEL_CHARS:START-->
| 항목 | 값 |
|---|---|
| 공백 제외 총 글자 | 8,956 |
| 공백 제외 본문 글자 | 8,736 |
| 한글 음절 수 | 7,479 |
<!--NOVEL_CHARS:END-->

| 항목 | 값 |
|---|---|
| 공백 제외 총 글자 | 8,956 |
| 공백 제외 본문 글자 | 8,736 |
| 한글 음절 수 | 7,479 |
