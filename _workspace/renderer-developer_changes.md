# Renderer Developer — PSD Merge UI 변경 요약

## 변경/생성 파일 목록 (절대 경로)

### 신규
1. `/Users/beni/ToonShark_realdraw/src/renderer/src/components/MergePsdModal.tsx`

### 수정
2. `/Users/beni/ToonShark_realdraw/src/shared/utils/index.ts`
3. `/Users/beni/ToonShark_realdraw/src/shared/utils/index.test.ts`
4. `/Users/beni/ToonShark_realdraw/src/renderer/src/i18n/en.ts`
5. `/Users/beni/ToonShark_realdraw/src/renderer/src/i18n/ko.ts`
6. `/Users/beni/ToonShark_realdraw/src/renderer/src/pages/HomePage.tsx`
7. `/Users/beni/ToonShark_realdraw/src/renderer/src/pages/WorkspacePage.tsx`

## 각 파일 핵심 변경 요약

### `src/shared/utils/index.ts`
- `naturalSort(a, b)` 헬퍼 추가 — `localeCompare` 에 `{ numeric: true, sensitivity: 'base' }` 옵션. 계약 그대로.

### `src/shared/utils/index.test.ts`
- `naturalSort` 4개 테스트 케이스 추가 (페이지 번호 자연 순서, 케이스 인센시티브, 혼합 접두사, 동일 문자열).

### `src/renderer/src/components/MergePsdModal.tsx` (신규)
- Props: `{ open, filePaths, onCancel, onMerged }` — 계약 시그니처 준수.
- 최초 렌더 & `filePaths` 변경 시 `naturalSort`로 정렬해 내부 상태 보유 (useState initializer + useEffect).
- 각 행: 순번 + basename + ▲/▼ 버튼. 첫/마지막 행에서 해당 방향 자동 disable. 병합 중엔 전 버튼 disable.
- [뒤로(취소)] / [합치기] 버튼. 병합 중엔 스피너 + `mergePsdInProgress` 라벨, 버튼 비활성.
- `window.api.mergePsdSources({ filePaths })` 호출, 성공 시 `onMerged(result)`, 실패 시 `toastStore.addToast('error', ...)`.
- 접근성: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. ESC 키(병합 중엔 무시)로 닫기. 오픈 시 취소 버튼에 초기 포커스(간단 포커스 트랩).
- 스타일: fixed overlay + `bg-black/60` 백드롭, 내부 카드는 `bg-surface border border-border`. 기존 색상 토큰(`text-primary`, `text-tertiary`, `bg-elevated`, `hover:bg-hover-elevated`) 그대로 사용. 백드롭 클릭 이벤트는 `stopPropagation`으로 하단 드롭 리스너와 분리.

### `src/renderer/src/i18n/en.ts`
- `TranslationKeys` 인터페이스에 `mergePsdTitle`, `mergePsdDesc`, `mergePsdConfirm`, `mergePsdInProgress`, `mergePsdError`, `moveUp`, `moveDown` 추가.
- 동일 키 값 추가 ("Merge PSD Files", "Selected PSD files will be concatenated vertically into a single source.", "Merge", "Merging...", "Failed to merge PSDs", "Move up", "Move down").

### `src/renderer/src/i18n/ko.ts`
- 동일 키 한국어 값 추가 ("PSD 파일 합치기", "선택한 PSD 파일들을 세로로 이어붙여 하나의 원본으로 엽니다.", "합치기", "합치는 중...", "PSD 합치기 실패", "위로", "아래로"). `TranslationKeys` 준수로 누락 없음 확인.

### `src/renderer/src/pages/HomePage.tsx`
- `isPsdFile` (`@shared/constants`) import 추가, `MergePsdModal` import 추가.
- `useState<string[] | null>` 모달 paths 상태 추가.
- `handleFileDrop`: `paths.length >= 2 && paths.every(isPsdFile)` 일 때 모달 open. 그 외 기존 로직(`addFileByPath` 루프 + `navigate('/workspace')`) 유지.
- JSX 최하단에 `<MergePsdModal />` 조건부 렌더. `onMerged` 에서 `addFileByPath(result.outputPath)` + `navigate('/workspace')`.

### `src/renderer/src/pages/WorkspacePage.tsx`
- `isPsdFile` import 추가, `MergePsdModal` import 추가.
- `useState<string[] | null>` 모달 paths 상태 추가.
- `handleFileDrop`: 동일 가드(`>= 2 && every(isPsdFile)`)로 모달 open. 그 외 기존 `for … addFileByPath` 유지 (이미 워크스페이스 내부이므로 navigate 없음).
- JSX 최상위 div 내부 끝에 `<MergePsdModal />` 렌더. `onMerged` 에서 `addFileByPath(result.outputPath)` 만 호출 (navigate 불필요).

## 계약에서 벗어난 결정

- **취소 버튼 라벨**: 계약은 "Cancel/취소"를 쓰라고 했으나 기존 i18n 체계에 단독 "cancel" 키가 없어 이미 존재하는 `t.back`("Back"/"뒤로")을 재사용했다. `mergePsd*` 네임스페이스가 아닌 공용 액션 성격이라 별도 새 키를 추가하지 않는 편이 사전 규약과 더 잘 맞는다고 판단. 추후 일관성 있는 "cancel" 키가 도입되면 교체하면 된다.
- **백드롭 클릭 닫기 미구현**: 접근성 요구는 ESC + 취소 버튼으로 충족. 백드롭 클릭 닫기는 드롭 제스처와 혼동될 여지가 있어 의도적으로 생략. (계약에 강제 조항 없음.)
- **계약 상 preload/shared-types는 수정 금지**로 되어 있었으나 확인 결과 main-developer가 선행 커밋에서 이미 `MergePsdRequest/Result` 타입과 `window.api.mergePsdSources`를 `src/preload/index.ts`에 추가해 두어 그대로 활용함 — 렌더러에서 별도 조정 불필요.
- **jobStore 탭 라벨**: 계약 명시대로 변경하지 않음. `merged_{ts}_{hash}.png` 파일명이 그대로 탭 라벨로 노출되는 건 MVP 수용.
- **useFileDrop 훅 미변경**: 계약 준수. 호출 측 로직만 조정.

## 테스트 결과

`npx vitest run` 전체 실행:
- **Test Files: 28 passed (28)**
- **Tests: 470 passed (470)**
- Duration 2.90s. 실패/누락 0.

주요 영향 범위 통과 확인:
- `src/shared/utils/index.test.ts` — 70 tests (naturalSort 4건 신규 포함)
- `src/renderer/src/pages/HomePage.dom.test.tsx` — 5/5 통과 (드롭 분기 가드 변경 후에도 기존 시나리오 유지)
- `src/renderer/src/pages/WorkspacePage.dom.test.tsx` — 3/3 통과
- `src/main/services/psd-merge.service.test.ts` — 4/4 통과 (main-developer의 서비스와 계약 정합)

TypeScript 체크:
- `npx tsc --noEmit -p tsconfig.web.json` — 본 작업으로 도입된 에러 없음. 출력에 남은 3건(`Array.at` 관련)은 `stash` 비교로 **pre-existing 에러**임을 확인 (나의 커밋과 무관, ExportPage/WorkspacePage dom.test 내부).

## 기존 동작 영향 (regression 검토)

- 단일 PSD 드롭 → 기존 경로(`addFileByPath` + navigate) 유지. 가드 `>= 2` 때문에 모달 미트리거.
- 혼합(PSD + PDF 등) 드롭 → `every(isPsdFile)` false이므로 기존 개별 추가 경로 유지.
- 2개 이상 PSD 드롭 → 모달 오픈. 확인 후 병합 PNG가 탭으로 열리고 HomePage 에선 `/workspace`로 이동.
- 2개 이상 PSD를 `파일 열기` 버튼으로 여는 경로는 `selectSourceFile`이 단일 반환이라 본 계약 범위 밖 (드롭 전용 기능).
