<p align="center">
  <img src="build/ToonShark.svg" width="128" height="128" alt="ToonShark 로고">
</p>

<h1 align="center">ToonShark</h1>

<p align="center">
  웹툰 PDF를 슬라이스하고, 각 플랫폼 규격에 맞춰 내보내는 데스크톱 도구
</p>

<p align="center">
  <a href="https://github.com/realdraw/ToonShark/actions/workflows/ci.yml"><img src="https://github.com/realdraw/ToonShark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/realdraw/ToonShark/releases/latest"><img src="https://img.shields.io/github/v/release/realdraw/ToonShark?include_prereleases" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/macOS-supported-brightgreen" alt="macOS">
  <img src="https://img.shields.io/badge/Windows-supported-brightgreen" alt="Windows">
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

## 소개

ToonShark은 웹툰 PDF를 개별 이미지로 분할하고, 각 연재 플랫폼이 요구하는 너비·포맷·파일 크기에 맞춰 자동으로 내보내주는 도구입니다.

### 작업 흐름

1. **PDF 열기** — 드래그 앤 드롭 또는 파일 선택
2. **슬라이스** — 자동(흰색 여백 감지) 또는 고정(균일 높이) 모드 선택
3. **미리보기** — 시뮬레이션된 기기 뷰포트(iPhone, Galaxy 등)에서 결과 확인
4. **내보내기** — 여러 플랫폼에 한 번에 배치 내보내기 (리디, 올툰, 왓챠, …)
5. **썸네일** — 슬라이스에서 영역을 크롭하여 플랫폼 규격 썸네일 생성

### 주요 기능

- **자동 슬라이스** — 패널 사이 흰색 여백을 분석해 자르기 경계를 자동 탐지
- **고정 슬라이스** — 설정한 픽셀 높이로 균일하게 분할
- **멀티 PDF 워크스페이스** — 여러 PDF를 탭으로 열어 동시 작업
- **기기 미리보기** — 커스텀 기기 프리셋으로 픽셀 단위 정확한 미리보기
- **플랫폼 내보내기** — 리사이즈, 포맷 변환(PNG/JPG), 최대 파일 크기 제한 적용
- **썸네일 캡처** — 슬라이스에서 영역을 크롭해 플랫폼 썸네일로 내보내기
- **프리셋 설정** — 기기 목록과 국가/플랫폼 스펙을 JSON으로 편집하거나 가져오기/내보내기
- **다크 / 라이트 / 시스템 테마**
- **영어 & 한국어 UI**

## 다운로드

> 릴리스 준비 중입니다.

빌드된 설치 파일이 제공될 예정입니다:

| OS | 형식 |
|----|------|
| macOS (Apple Silicon & Intel) | `.dmg` |
| Windows x64 | `.exe` (NSIS 설치 프로그램) |

## 소스에서 빌드

### 요구 사항

- **Node.js** >= 24
- **npm** >= 11

### 설치 및 실행

```bash
git clone https://github.com/user/toonshark.git
cd toonshark
npm install
npm run dev
```

### 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 모드 실행 |
| `npm run build` | 렌더러 & 메인 프로세스 빌드 |
| `npm test` | 유닛 테스트 실행 (Vitest) |
| `npm run test:e2e` | E2E 테스트 실행 (Playwright + Electron) |
| `npm run dist:mac` | macOS 패키징 (.dmg) |
| `npm run dist:win` | Windows 패키징 (.exe) |

## 기술 스택

| 계층 | 기술 |
|------|------|
| 프레임워크 | Electron 41 |
| 프론트엔드 | React 19, React Router 7, Zustand 5 |
| 스타일링 | Tailwind CSS 4 |
| 빌드 | electron-vite, Vite 7 |
| 이미지 처리 | Sharp, @napi-rs/canvas |
| PDF 렌더링 | pdfjs-dist |
| 테스트 | Vitest, Playwright, Testing Library |
| 언어 | TypeScript 5 |

## 프로젝트 구조

```
src/
├── main/             # Electron 메인 프로세스
│   ├── ipc/          # IPC 핸들러 등록
│   └── services/     # 핵심 서비스 (슬라이스, 내보내기, PDF, 설정 등)
├── preload/          # 컨텍스트 브릿지 (렌더러 ↔ 메인)
├── renderer/         # React 프론트엔드
│   └── src/
│       ├── app/      # 앱 루트 & 라우팅
│       ├── components/
│       ├── hooks/
│       ├── i18n/     # 영어 / 한국어 번역
│       ├── pages/
│       └── stores/   # Zustand 스토어
├── shared/           # 프로세스 간 공유 타입 & 상수
resources/
└── defaults/         # 기본 기기 프리셋 & 플랫폼 스펙 (JSON)
```

## 플랫폼 프리셋

플랫폼 내보내기 스펙은 `resources/defaults/countries.json`에 정의되어 있습니다. 이 파일을 직접 편집하거나, 앱 내 가져오기/내보내기 기능을 사용하여 플랫폼을 추가하거나 수정할 수 있습니다.

각 플랫폼에는 다음이 정의됩니다:
- **에피소드 스펙** — 목표 너비, 이미지 포맷 (png/jpg), 최대 파일 크기
- **썸네일 스펙** (선택) — 너비, 높이, 포맷, 최대 파일 크기

## 문서

- [User Manual (English)](docs/manual_en.md)
- [사용 매뉴얼 (한국어)](docs/manual_ko.md)

## 기여

기여를 환영합니다! 이슈를 등록하거나 Pull Request를 제출해 주세요.

## 크레딧

- [beni](https://github.com/sejoung) — 제작자 & 메인테이너
- **bela** — "ToonShark"이라는 프로젝트 이름을 지어준 분
- 이름을 정할 때 관심 있게 의견을 나눠주신 **REALDRAW**의 모든 구성원분들께 감사드립니다

## 라이선스

Copyright 2026 REALDRAW Inc.

Apache License 2.0 — 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
