# Pixel Mat

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

AI 스킬로 실제 픽셀 크기의 아트를 만들고, 로컬 편집기에서 열어 마무리합니다.
Pixel Mat은 Windows 앱과 독립 실행형 Node CLI, AI 호스트용 스킬을 함께
제공합니다. 앱과 스킬은 픽셀·팔레트·프로젝트 처리 코어를 공유합니다.

이미지 모델은 초안을 만들고 로컬 도구는 목표 격자, 색상 제한, 편집 가능한
`.pixeltool` 파일을 만듭니다. 얼굴·손·작은 소품의 세부 형태가 모두 보존되지는
않으므로 실제 크기에서 확인해야 합니다.

**Windows 베타: 0.23.0-beta.2.** 공개 파일은
[릴리스 페이지](https://github.com/hjcud/Pixerin/releases), 서명되지 않은 폴더형
배포물의 실행·업데이트 방법은 [베타 안내](BETA_DISTRIBUTION.md)에서 확인하세요.
이번 후보는 한국어 원문에서 6개 언어 번역을 새로 작성했습니다.
[번역 출처 기록](TRANSLATION_PROVENANCE_REVIEW.md)과
[공개 배포 체크리스트](PUBLICATION_CHECKLIST.md)를 함께 제공합니다.

## 결과 예시

| 물체, 32×32를 8배 표시 | 인물, 32×32를 8배 표시 |
| --- | --- |
| ![검](docs/comparison/sword-native-display.png) | ![탐험가](docs/comparison/explorer-native-display.png) |

텍스트만으로 생성한 동일 원본을 로컬 변환한 예시입니다. 검은 큰 재질 구분을
유지하지만 탐험가는 얼굴과 손의 세부 표현을 잃습니다.
[원본·실제 크기·프롬프트·한계](docs/COMPARISON.md)를 함께 공개합니다.
이미지 도구가 실제 모델 ID를 제공하지 않아 동일 GPT의 통제 비교로 주장하지 않습니다.

[Miniworld 사례](docs/MINIWORLD_CASE_STUDY.md)에서는 실제 주민·나무·집 초안을
네이티브 변환·위치 맞춤·팔레트 조정·앱 편집으로 연결합니다. 원본 초안과 편집
가능한 결과, RGBA 재현 검사 13개를 공개하며 맵은 Unity 실행 화면이 아닌 오프라인 배치 예시입니다.

## 앱 시작

검토된 Windows x64 베타 폴더를 받으면 전체 압축을 풀고 `PixelTool.exe`를
실행하세요. 호환성을 위해 기존 실행 파일 이름을 유지합니다. 서명된 설치 파일은
제공하지 않습니다.

소스 실행에는 Windows, Node **22.12 이상**, pnpm이 필요합니다.

```sh
pnpm install
pnpm start
```

1. 스킬이 만든 PNG 또는 `.pixeltool` 파일을 엽니다.
2. 활성 레이어에서 연필, 선택 영역, 마스크, 팔레트 도구로 수정합니다.
3. Ctrl+S로 편집 가능한 프로젝트를 저장하고 원래 해상도의 PNG를 내보냅니다.
4. 애니메이션은 패널 배치 메뉴에서 열고 시트·JSON·APNG로 내보냅니다.

수동 편집, 로컬 변환, 파일 입출력은 오프라인으로 작동합니다. 앱의 기존
7개 언어는 유지하며 문서 3개 언어와 별개입니다.

## 스킬 설치·사용

```sh
pnpm build:skill
```

`dist/pixel-mat-skill.zip`의 전체 `pixel-mat` 폴더를 사용하세요. Node **22 이상**이
필요하며 Electron이나 추가 패키지 설치는 필요 없습니다.
[설치·첫 작업 안내](skills/pixel-mat/references/getting-started.md)에서 호스트가
지원하는 설치 위치를 확인하세요. 저장소의 스킬 원본 폴더만 복사하면 독립 실행용
런타임이 포함되지 않습니다.

이미지를 볼 수 있는 AI 호스트에 다음처럼 자연어로 요청합니다.

> Pixel Mat 스킬로 32×32, 투명색 포함 최대 16색 탐험가를 만들어 줘.
> 실제 크기와 정수 배율 확대를 확인하고 PNG와 편집 가능한 프로젝트를 전달해 줘.

위 문장은 호스트 호출 예시이며 터미널 명령어가 아닙니다. 직접 변환하려면:

```sh
node /path/to/pixel-mat/scripts/pixel-mat.mjs prepare --input draft.png --output sprite.pixeltool --width 32 --height 32 --colors 16
node /path/to/pixel-mat/scripts/pixel-mat.mjs preview --input sprite.pixeltool --output sprite.png --scale 1
```

정확한 색인 격자는 `from-grid`, 재사용 부품은 `from-parts`, 제한된 수정은
`review-context`/`refine`, 일관된 프레임은 `render-motion`을 사용합니다.
[스킬 지침](skills/pixel-mat/SKILL.md)과 [CLI](skills/pixel-mat/references/cli.md)에
입출력과 거절된 계획의 수정 방법이 있습니다.

## AI 연결·비용

앱의 AI 수정은 활성 레이어·선택·팔레트·알파·마스크·세부 보호를 검증한 뒤
제안으로 표시하고 한 번에 적용·실행 취소합니다. Precise는 제한된 격자 수정,
Whole은 이미지 초안과 로컬 변환입니다. 재변환은 추가 생성 요청 없이 가능합니다.

앱 내부 API는 직접 설정한 OpenAI·Claude·Gemini 키와 모델을 사용합니다.
Whole 이미지 생성은 현재 OpenAI API를 사용합니다. 기본 연결은 없습니다.
설정 → AI의 Codex 스킬 항목을 펼치면 공식 CLI 명령으로 버전·로그인 상태를
확인하고 호스트의 스킬·파일 전달을 안내합니다. 추론 요청이나 인증 파일 추출은
없으며 구독 로그인을 앱 내부 이미지 API로 바꾸지 않습니다. 확인 종료는 Codex
로그아웃이 아닙니다. [데이터 처리](DATA_HANDLING.md)를 참고하세요.

도구와 로컬 CLI는 [MIT 라이선스](LICENSE)로 무료입니다. AI 사용은 본인의 계정,
구독 한도 또는 API 크레딧을 사용하며 개발자가 토큰·크레딧을 제공하지 않습니다.
로컬 결정적 처리는 모델을 호출하지 않습니다. API 토큰·이미지 생성 비용·호스트
구독 사용량을 구분하며 측정 불가 값은 unknown으로 남깁니다. 절감률을 만들지
않습니다. PixelLab 계정이나 새로운 유료 서비스는 필요 없습니다.

## 검증된 처리와 실험

기본 변환은 원본 비율, 특징 샘플링, 지각 기반 원본색 팔레트 피팅을 사용하며
디더링하지 않습니다. Source structure는 선택 기능입니다.
[기술과 근거](docs/TECHNIQUES.md)에서 기본·선택·연구 기능을 구분합니다.
AI 원본 분석·형태 재구성·호스트 레이아웃·source planes는 실험 기능입니다.
안정적인 16px 인물 복원이나 정확한 단색 칩 생성은 해결됐다고 주장하지 않습니다.
사용자가 좋아한 간결한 전체 비율·실루엣과 얼굴 원본 재현은 별도로 평가합니다.

새 캔버스는 한 변 최대 3840px, 총 8,294,400px이며 레이어 메모리 제한도 적용됩니다.
정밀 AI·자동 모션 범위는 더 작습니다. 큰 이미지 생성은 실험 상태입니다.
정적 v1/v2·애니메이션 v3·autosave·내부 식별자를 유지합니다. Aseprite 프로젝트
가져오기는 없습니다. [편집 안내](docs/EDITOR_GUIDE.md)를 참고하세요.

## 개발·기여

```sh
pnpm test
pnpm test:desktop
pnpm build
pnpm test:package
pnpm build:skill
```

데스크톱 검사는 격리 프로필과 모의 모델을 사용합니다. 통과는 기술 동작의 증거이며
그림 품질 승인이 아닙니다. [기여 안내](CONTRIBUTING.md),
[이슈](https://github.com/hjcud/Pixerin/issues), [보안 신고](SECURITY.md),
[라이선스 범위·출처](LICENSE_SCOPE.md), [외부 구성요소](THIRD_PARTY_NOTICES.md)를 확인하세요.
저장소 기여 문서는 영어가 기본입니다. 현재 `Pixerin` URL을 유지하며, 향후
`pixel-mat`으로 바꿀 때를 위한 [이름 변경 계획](docs/REPOSITORY_PLAN.md)을 준비했습니다.
