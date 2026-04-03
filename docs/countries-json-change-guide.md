# countries.json 변경 시 코드 검토 가이드

`resources/defaults/countries.json` 파일에 변경이 발생할 때 반드시 확인해야 하는 코드 영역을 정리한 문서입니다.

---

## 1. JSON 스키마 준수 여부

`countries.json`은 `Country[]` 타입을 따릅니다. 변경 시 아래 타입 정의와 일치하는지 확인합니다.

**파일:** `src/shared/types/index.ts`

```ts
type Country = {
  id: string
  platforms: Platform[]
}

type Platform = {
  id: string
  episode: EpisodeSpec       // 필수
  thumbnail?: ThumbnailSpec  // 선택
}

type EpisodeSpec = {
  width: number
  format: 'jpg' | 'png'
  maxFileSizeMB?: number     // null 또는 생략 가능
}

type ThumbnailSpec = {
  width: number
  height: number
  format: 'jpg' | 'png'
  maxFileSizeMB?: number
}
```

**체크리스트:**
- `country.id`가 비어있지 않은 문자열인가
- `platforms` 배열에 최소 1개 플랫폼이 있는가
- 각 `platform.id`가 비어있지 않은 문자열인가
- `episode.width`가 0보다 큰 숫자인가
- `episode.format`이 `"jpg"` 또는 `"png"`인가
- `thumbnail`이 있을 경우 `width`, `height`가 0보다 큰가
- `thumbnail.format`이 `"jpg"` 또는 `"png"`인가

---

## 2. i18n 번역 매핑 업데이트

새로운 `country.id` 또는 `platform.id`를 추가한 경우, i18n 파일의 이름 매핑에 해당 ID를 추가해야 합니다. 누락 시 UI에 raw ID가 그대로 표시됩니다.

**파일:**
- `src/renderer/src/i18n/ko.ts` — `countryName()`, `platformName()`
- `src/renderer/src/i18n/en.ts` — `countryName()`, `platformName()`

**예시 (ko.ts):**
```ts
countryName: (id: string) => {
  const names: Record<string, string> = {
    kr: '한국',
    // 새 country ID 추가
  }
  return names[id] ?? id
},
platformName: (id: string) => {
  const names: Record<string, string> = {
    ridi: '리디',
    // 새 platform ID 추가
  }
  return names[id] ?? id
},
```

---

## 3. 단위 테스트 통과 확인

기존 테스트가 `countries.json`의 구조적 유효성을 검증합니다. 변경 후 반드시 테스트를 실행합니다.

**파일:** `src/shared/constants/index.test.ts`

**검증 항목:**
- 최소 1개 country 존재
- 모든 country에 `id`, `platforms` 필드 존재
- 모든 platform에 `id`, `episode` 필드 존재
- `episode.format`이 `'jpg'` 또는 `'png'`
- `thumbnail`이 있으면 `width > 0`, `height > 0`, format 유효

```bash
npx vitest run src/shared/constants/index.test.ts
```

---

## 4. 내보내기 서비스 영향 확인

내보내기 시 `countryId`와 `platformId`를 조합하여 출력 폴더명을 생성합니다. ID에 파일시스템 비안전 문자가 포함되면 `sanitizeFolderId()`를 거치지만, 가능하면 영문 소문자와 언더스코어만 사용하는 것이 안전합니다.

**파일:** `src/main/services/export.service.ts`

**확인 사항:**
- 새 platform의 `episode` 스펙(width, format, maxFileSizeMB)이 내보내기 로직에서 정상 처리되는가
- `thumbnail`이 없는 플랫폼은 썸네일 캡처 시 정상적으로 건너뛰는가 (예: `mrblue`, `oreum`, `bookpal`)
- `maxFileSizeMB`가 `null`인 경우 파일 크기 제한 없이 동작하는가

---

## 5. 썸네일 캡처 관련 확인

`SliceDetailPage`에서 썸네일이 있는 플랫폼만 드롭다운에 표시됩니다. 새 플랫폼에 `thumbnail` 스펙이 있으면 자동으로 노출됩니다.

**파일:** `src/renderer/src/pages/SliceDetailPage.tsx`

**확인 사항:**
- `thumbnail` 스펙이 있는 새 플랫폼이 드롭다운에 정상 노출되는가
- `thumbnail`의 `width:height` 비율이 해당 플랫폼의 실제 요구사항과 일치하는가

---

## 6. ID 유일성 확인

동일 country 내에서 `platform.id`가 중복되면 내보내기 히스토리(`countryId/platformId` 키)와 출력 폴더가 충돌합니다.

**확인 사항:**
- 같은 country 내 platform ID 중복 없음
- country ID 전체에서 중복 없음
- 기존에 사용 중인 ID를 변경하면 이전 내보내기 히스토리와의 호환성이 깨질 수 있음

---

## 7. settings.service.ts 로딩 확인

`countries.json`은 앱 시작 시 `settings.service.ts`에서 `readFileSync`로 로드됩니다. JSON 문법 오류가 있으면 앱 시작이 실패합니다.

**파일:** `src/main/services/settings.service.ts`

**확인 사항:**
- JSON이 문법적으로 유효한가 (trailing comma, 주석 없음)
- UTF-8 인코딩인가

---

## 변경 유형별 빠른 참조

| 변경 유형 | 확인 영역 |
|---|---|
| 새 country 추가 | 스키마, i18n(`countryName`), 테스트, ID 유일성 |
| 새 platform 추가 | 스키마, i18n(`platformName`), 테스트, ID 유일성, 내보내기 |
| thumbnail 스펙 추가/변경 | 스키마, 테스트, SliceDetailPage 드롭다운, 비율 확인 |
| episode 스펙 변경 | 스키마, 테스트, 내보내기 서비스 |
| ID 이름 변경 | i18n, 내보내기 히스토리 호환성, 출력 폴더명 |
| 항목 삭제 | i18n 정리(선택), 기존 히스토리 영향 검토 |
