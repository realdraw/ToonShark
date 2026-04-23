# Renderer Developer — PSD 지원 변경 요약

## 변경 파일 목록 (절대 경로)

1. `/Users/beni/ToonShark_realdraw/src/renderer/src/i18n/ko.ts`
2. `/Users/beni/ToonShark_realdraw/src/renderer/src/i18n/en.ts`
3. `/Users/beni/ToonShark_realdraw/src/renderer/src/pages/HomePage.tsx`

## 각 파일 핵심 변경 요약

### `src/renderer/src/i18n/ko.ts`
- `dropFileHere` 문구를 `'PDF 또는 이미지 파일을 여기에 놓으세요'` → `'PDF, 이미지, PSD 파일을 여기에 놓으세요'` 로 변경.

### `src/renderer/src/i18n/en.ts`
- `dropFileHere` 문구를 `'Drop PDF or image files here'` → `'Drop PDF, image, or PSD files here'` 로 변경.

### `src/renderer/src/pages/HomePage.tsx`
- 빈 상태 영역의 하드코드된 파일타입 라벨 `"PDF / JPG / PNG"` → `"PDF / JPG / PNG / PSD"` 로 변경 (line 213).

## shared 계약에서 `isPsdFile` 사용한 위치

**없음.** 현재 계약상 PSD는 `isPdfFile` false 경로를 그대로 타고(pdfScale 미전달), UI 게이팅도 기존 `isPdfFile(filePath)` 조건으로 충분히 처리된다. 별도 PSD 안내 문구도 넣지 않기로 한 원칙을 따랐다.

향후 PSD 전용 UI(뱃지 강조 등)가 필요해질 경우 `@shared/constants`에서 `isPsdFile`을 import해 사용할 수 있다. 현재 시점에서는 필요 없어 추가하지 않았다.

## 하드코드 확장자 체크 조사 결과

`grep -rn "pdf\|jpg\|png\|jpeg" src/renderer --include="*.ts" --include="*.tsx"` 로 전체 확인:

- `src/renderer/src/hooks/useFileDrop.ts` — `isSupportedFile(file.name)` 사용 (shared helper). shared constants 업데이트만으로 PSD 자동 수용됨. **수정 불필요**.
- `src/renderer/src/components/OptionPanel.tsx` — `showPdfScale = filePath ? isPdfFile(filePath) : true`. PSD는 `isPdfFile` false → pdfScale 슬라이더 자동 숨김 (계약과 일치). **수정 불필요**.
- `src/renderer/src/pages/WorkspacePage.tsx` — `isPdfFile(activeFilePath) ? opts.pdfScale : undefined` 로직 유지. PSD는 pdfScale 미전달이 올바른 동작. `getFileExtension`으로 탭 라벨/뱃지를 만들기 때문에 PSD도 자동으로 `PSD` 뱃지가 표시됨. **수정 불필요**.
- `src/renderer/src/pages/HomePage.tsx` — `extBadge = getFileExtension(filePath).replace('.', '').toUpperCase()` 사용. PSD도 자동으로 `PSD` 뱃지 표시됨. 단, 빈 상태 안내용 하드코드 텍스트 `"PDF / JPG / PNG"`가 있어 **업데이트함**.
- 기타 renderer 내 `pdf/jpg/png/jpeg` 리터럴은 모두 `pdfScale`, `jpgQuality`, 스토어 키, i18n 키 등 (파일 필터/검증과 무관). 수정 필요 없음.

**요약**: 필터/검증 로직은 전부 shared helper를 쓰고 있어 shared 업데이트가 전파된다. 유일하게 하드코드된 UI 문자열 (HomePage의 "PDF / JPG / PNG")만 PSD 포함으로 업데이트했다.

## 테스트 실행 결과 (renderer 관련)

전체 vitest 실행 (`npx vitest run --config vitest.config.ts`):
- **Test Files: 26 passed (26)**
- **Tests: 453 passed (453)**
- 소요 3.20s, 실패 0건.

관련 renderer DOM 테스트 모두 통과:
- `HomePage.dom.test.tsx` — 5 tests passed
- `WorkspacePage.dom.test.tsx` — 3 tests passed
- `SliceDetailPage.dom.test.tsx` — 6 tests passed
- `ExportPage.dom.test.tsx` — 4 tests passed
- `SettingsPage.dom.test.tsx` — 4 tests passed

renderer 스토어 테스트:
- `jobStore.test.ts` — 17 tests passed
- `toastStore.test.ts` — 13 tests passed
- `workspaceStore.test.ts` — 21 tests passed

PSD 관련 신규 테스트는 계약(renderer-developer.md 지시)에 따라 추가하지 않음 (로직 변경 없이 i18n 문구와 빈 상태 라벨만 업데이트).

## 기존 동작 영향

- pdf/jpg/png 경로: 영향 없음. 로직 변경 없음.
- 한글/영문 번역 일관성: 유지됨 (동일한 의미, PSD 항목만 추가).
- OptionPanel: `isPdfFile` 기반 게이팅이 그대로 작동해 PSD에서는 scale 슬라이더 자동 숨김.
- WorkspacePage: `isPdfFile` 기반으로 pdfScale 옵션 전달 여부 결정 — PSD는 자동으로 pdfScale 제외됨.
