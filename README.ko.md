# Pixel Mat

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

게임에 쓸 픽셀 아트 초안을 만드는 AI 스킬과 Windows 편집기입니다.
원하는 픽셀 크기와 색 수로 만든 뒤, 앱에서 픽셀·레이어·팔레트를 수정할 수 있습니다.

**Windows 베타 · 0.23.0-beta.2**
[앱 다운로드](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/PixelMat-0.23.0-beta.2-win-x64.zip) ·
[스킬 다운로드](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/pixel-mat-skill-0.23.0-beta.2.zip) ·
[변경 내역·체크섬](https://github.com/hjcud/pixel-mat/releases/tag/v0.23.0-beta.2) ·
[포트폴리오 사례](https://hjcud.github.io/#pixel-mat)

## 만든 이유

16×16 픽셀 아트를 요청해도 큰 이미지가 나오거나, 픽셀의 경계와 색이 일정하지
않은 경우가 있었습니다. 게임에서는 실제 픽셀 크기에 맞는 리소스가 필요했습니다.
생성 지침과 로컬 변환, 편집기를 연결해 PNG로 쓰고 이후에도 수정할 수 있도록 만들었습니다.

## 16×16 캐릭터 예시

| AI가 생성한 16×16 색칩 보드 | 실제 16×16 결과를 16배 확대 |
| --- | --- |
| <img src="docs/whole-style-recovery/accepted-board.png" width="256" alt="256개의 색칩으로 구성된 실제 생성 보드"> | <img src="docs/whole-style-recovery/accepted-median-display.png" width="256" alt="채택한 빨간 후드 캐릭터의 정수 배율 확대"> |

이 예시는 이전에 채택한 보드와 투명색 포함 16색 고정 팔레트를 사용합니다.
현재 앱과 스킬에서도 같은 픽셀로 재현됩니다.
[원본 PNG·프로젝트·재현 방법](docs/whole-style-recovery/README.md) ·
[별도의 동일 사용자 프롬프트 비교](docs/whole-comparison/README.md)

### 16×16 기본 생성 흐름

1. **남길 특징의 위치를 계획합니다.** AI가 얼굴·몸·손·소품을 최종 256칸 안에
   함께 배치하도록 지침을 전달하고 색칩 보드를 생성합니다.
2. **격자를 검사하고 대표색을 읽습니다.** 로컬 코드가 분리된 칸을 찾아 개수와
   정렬을 검사하고, 각 칸 중앙 영역의 RGB별 중앙값을 구합니다.
3. **배경을 분리합니다.** 가장자리에서 이어지는 회색 빈칸만 투명하게 바꿔,
   대상 내부에 남겨야 할 비슷한 색은 보존합니다.
4. **팔레트에 맞춰 저장합니다.** 지정한 팔레트에 색을 맞추거나 목표 색 수로
   정리한 뒤 실제 크기의 PNG와 편집 가능한 `.pixeltool` 프로젝트를 만듭니다.

16×16의 기본값은 **Whole-chip central median(중앙 대표색)**입니다.
**영역 배정**은 같은 보드에서 선택하는 베타 변환이며, 다른 크기에는 일반 이미지
변환을 사용합니다. [생성 흐름 자세히 보기](skills/pixel-mat/references/whole-image.md)

## 결과를 이어서 편집하기

<img src="docs/readme/editor.png" width="800" alt="32×40 Miniworld 집 프로젝트를 연 실제 Pixel Mat Windows 편집기">

Miniworld의 32×40 집 프로젝트를 연 앱 화면입니다. 게임 리소스 제작 사례는
[포트폴리오](https://hjcud.github.io/#pixel-mat)에서도 확인할 수 있습니다.

| 작업 | 사용하는 흐름 |
| --- | --- |
| 요청이나 참조 이미지로 생성 | 이미지 생성 후 색칩 또는 일반 이미지 변환 |
| 정확한 픽셀과 재사용 부품 설계 | AI가 작성한 격자·부품 배치를 `from-grid` / `from-parts`로 구성 |
| 기존 스프라이트 수정 | 수동 도구 또는 선택 영역·팔레트·알파를 보호하는 제한된 AI 수정 |
| 채택한 스프라이트 애니메이션 | 픽셀 부품과 동작 계획을 재사용해 시트·프레임 JSON·APNG로 출력 |

AI 제안을 확인한 뒤 적용하고 한 번에 실행 취소할 수 있습니다.
앱과 독립 실행형 CLI는 픽셀·팔레트·프로젝트 처리 코드를 공유합니다.

## 앱 시작

1. 위 Windows x64 ZIP을 받아 **전체 폴더의 압축을 풉니다.**
2. `PixelTool.exe`를 실행합니다. 실행에 필요한 파일을 함께 보관하세요. 서명되지 않은 베타입니다.
3. PNG 또는 `.pixeltool`을 열어 수정하고, 프로젝트 저장과 원래 크기의 PNG 내보내기를 사용합니다.

수동 편집과 파일 입출력은 오프라인으로 작동하며, 앱은 7개 UI 언어를 지원합니다.
[설치·업데이트](BETA_DISTRIBUTION.md)와 [편집기 안내](docs/EDITOR_GUIDE.md)를 참고하세요.

## 스킬 설치·사용

위 스킬 ZIP에서 런타임과 의존성이 포함된 전체 `pixel-mat` 폴더를 사용하세요.
AI 호스트가 지원하는 스킬 폴더에 설치합니다. **Node 22 이상**이 필요하며,
Electron이나 추가 패키지 설치는 필요 없습니다.
[설치와 첫 작업](skills/pixel-mat/references/getting-started.md)

이미지를 생성할 수 있는 AI 호스트에 다음처럼 요청합니다.

> Pixel Mat으로 16×16 탐험가를 투명색 포함 최대 16색으로 만들어 줘.
> 실제 크기와 정수 배율 확대를 보여주고, PNG와 편집 프로젝트를 전달해 줘.

생성한 16×16 색칩 보드를 로컬에서 변환하려면:

```sh
node /path/to/pixel-mat/scripts/pixel-mat.mjs whole-prepare --input board.png --width 16 --height 16 --colors 16 --output sprite.pixeltool
node /path/to/pixel-mat/scripts/pixel-mat.mjs preview --input sprite.pixeltool --scale 1 --output sprite.png
```

기존 팔레트를 유지하려면 `--palette existing.pixeltool`을 지정합니다. 일반 이미지
초안에는 `prepare`를 사용합니다. 다른 작업은 [스킬 지침](skills/pixel-mat/SKILL.md)과
[CLI 안내](skills/pixel-mat/references/cli.md)를 참고하세요.

## AI 연결·현재 한계

로컬 편집기와 CLI는 AI 계정 없이 사용할 수 있습니다. 생성에는 본인의 호스트
계정, 구독 한도 또는 API 크레딧을 사용하며 개발자가 토큰이나 크레딧을 제공하지
않습니다. CLI 자체는 모델을 호출하지 않습니다.

앱 내부 AI 연결은 별도로 설정합니다. 전체 이미지 API 생성은 OpenAI를 사용하며,
호스트 구독이 앱 내부 API 연결로 바뀌지는 않습니다. Codex 항목은 CLI 상태 확인과
스킬·파일 전달을 안내합니다. [연결·데이터 처리](DATA_HANDLING.md)

결과는 실제 크기에서 확인하세요. 격자와 색 수가 맞아도 표정이나 작은 소품이
충분히 남지 않을 수 있습니다. 원본 분석·재구성·레이아웃·샘플링 평면은 실험
기능입니다. 채택한 보드와 팔레트를 보존하세요. 새로 생성하면 다른 그림이 나옵니다.
[기법과 검증 기록](docs/TECHNIQUES.md)

## 개발·기여

소스 실행에는 Windows, Node **22.12 이상**, pnpm이 필요합니다.

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm build:skill
```

필요한 데스크톱·배포 검사는 [기여 안내](CONTRIBUTING.md)를 따릅니다.
자동화된 모델 검사는 모의 응답을 사용합니다.
[이슈](https://github.com/hjcud/pixel-mat/issues)는 영어로 작성해 주세요.

코드와 스킬 지침은 [MIT 라이선스](LICENSE)로 제공합니다. 참조 이미지와 게임
리소스의 사용 조건은 [라이선스 범위](LICENSE_SCOPE.md)에서 구분합니다.
[보안 신고](SECURITY.md) · [외부 구성요소](THIRD_PARTY_NOTICES.md) ·
[번역 출처](TRANSLATION_PROVENANCE_REVIEW.md)
