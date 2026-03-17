import type {TranslationKeys} from './en'

const ko: TranslationKeys = {
  // Common
  loading: '로딩 중...',
  back: '뒤로',
  delete: '삭제',
  open: '열기',
  run: '실행',
  processing: '처리 중...',
  saved: '저장 완료!',

  // HomePage
  appTitle: 'ToonShark',
  openFolder: '폴더 열기',
  settings: '설정',
  openPdf: 'PDF 열기',
  recentJobs: '최근 작업',
  noJobsTitle: '작업 내역이 없습니다',
  noJobsDesc: 'PDF를 열어 시작하세요',
  dropPdfHere: 'PDF 파일을 여기에 놓으세요',
  runs: (n: number) => `${n}회 실행`,
  slices: (n: number) => `${n}개 슬라이스`,
  preview: '미리보기',
  fixed: '고정',
  auto: '자동',

  openPdfs: '열린 PDF',

  // WorkspacePage
  addPdf: '+ PDF 추가',
  home: '홈',
  filePrefix: '파일 접두사',
  filePrefixDesc: '출력 파일명 앞에 붙는 이름. PDF 파일명에서 자동 생성되며 한글도 사용 가능',
  sliceMode: '분할 모드',
  sliceModeDesc: '자동: 흰색 여백을 분석해 컷 경계를 자동 탐지. 고정: 일정한 높이로 기계적 분할',
  whiteThreshold: '여백 색상 민감도',
  whiteThresholdDesc: '엄격: 완전한 흰색만 여백으로 인식합니다. 느슨: 약간 회색이 섞여도 여백으로 인식합니다. 대부분의 경우 \'엄격\'을 권장합니다.',
  loose: '느슨',
  strict: '엄격',
  whiteOnly: '흰색만',
  minWhiteRunLabel: '최소 여백 높이 (px)',
  minWhiteRunDesc: '연속된 흰색 행이 최소 이 픽셀 이상이어야 컷 경계로 인식합니다. 값을 높이면 작은 여백은 무시됩니다.',
  minSliceHeightLabel: '최소 슬라이스 높이 (px)',
  minSliceHeightDesc: '분할된 각 슬라이스의 최소 높이입니다. 너무 작은 조각이 생기는 것을 방지합니다.',
  cutPositionLabel: '자르기 위치',
  cutPositionDesc: '여백 중앙: 흰색 영역의 정중앙에서 자릅니다. 색상 직전: 흰색이 끝나고 그림이 시작되는 바로 위에서 자릅니다.',
  cutMiddle: '여백 중앙',
  cutBeforeColor: '색상 직전',
  sliceHeightLabel: '슬라이스 높이 (px)',
  sliceHeightDesc: '각 슬라이스의 고정 높이입니다.',
  startOffsetLabel: '시작 오프셋 (px)',
  startOffsetDesc: '이미지 상단에서 이 픽셀만큼 건너뛴 후부터 분할을 시작합니다. 상단 여백이나 헤더를 제외할 때 사용합니다.',
  pdfScaleLabel: 'PDF 렌더 스케일',
  pdfScaleDesc: 'PDF를 이미지로 변환할 때의 배율. 1.0 = 원본 크기, 2.0 = 2배 해상도. 높을수록 선명하지만 처리 시간이 길어집니다.',
  noResultsTitle: '결과가 없습니다',
  noResultsDesc: '옵션을 조정한 뒤 실행을 클릭하세요',
  runCount: (n: number) => `(${n}회 실행)`,
  sourcePdf: '원본 PDF',
  folder: '폴더',
  detail: '상세',

  // JobDetailPage
  createdAt: '생성일',
  pages: '페이지',
  slicesLabel: '슬라이스',
  mode: '모드',
  fixedInterval: '고정 간격',
  prefixLabel: '접두사',
  sourcePdfLabel: '원본 PDF',
  openSourcePdf: '원본 PDF 열기',

  // SliceDetailPage
  sliceNotFound: '슬라이스를 찾을 수 없습니다',
  jobNotFound: '작업을 찾을 수 없습니다',
  prev: '이전',
  next: '다음',
  page: (n: number) => `${n}페이지`,
  scrollSpeed: '스크롤',

  // PreviewPage
  width: '너비',
  height: '높이',
  gap: '간격',

  // SettingsPage
  settingsTitle: '설정',
  storage: '저장소',
  baseDir: '기본 디렉토리',
  browse: '찾아보기',
  sliceDefaults: '분할 기본값',
  defaultHeight: '기본 높이 (px)',
  autoSlice: '자동 분할',
  marginSensitivity: '여백 색상 민감도',
  minMarginHeight: '최소 여백 높이 (px)',
  minSliceHeightSetting: '최소 슬라이스 높이 (px)',
  cutPositionSetting: '자르기 위치',
  naming: '파일명',
  defaultPrefix: '기본 접두사',
  filenamePadding: '번호 자릿수',
  pdfScaleSetting: 'PDF 렌더 스케일',
  previewSection: '미리보기',
  imageGap: '이미지 간격 (px)',
  scrollAmountSetting: '스크롤 속도 (px)',
  saveSettings: '설정 저장',
  saveSettingsFailed: '설정 저장에 실패했습니다',
  language: '언어',
  languageSection: '언어',
  english: 'English',
  korean: '한국어',
  themeSection: '테마',
  themeLabel: '외관',
  themeLight: '라이트',
  themeDark: '다크',
  themeSystem: '시스템',

  // Storage Info
  totalUsage: '전체',
  storageWarning: (size: string) => `저장 용량이 ${size}입니다. 오래된 작업을 정리하여 디스크 공간을 확보하세요.`,
  storageWarningAction: '정리하기',
  deleteAll: '전체 삭제',
  deletePdf: '삭제',
  confirmDeleteAll: '모든 작업 히스토리를 삭제하시겠습니까? 모든 파일이 영구적으로 삭제됩니다.',
  confirmDeletePdf: (name: string) => `"${name}"의 모든 히스토리를 삭제하시겠습니까? 관련 파일이 모두 영구적으로 삭제됩니다.`,
  confirmDeleteJob: '이 작업을 삭제하시겠습니까? 관련 파일이 영구적으로 삭제됩니다.',

  // Device Presets
  devicePresets: '디바이스 프리셋',
  deviceName: '디바이스 이름',
  viewportWidth: '너비 (px)',
  viewportHeight: '높이 (px)',
  addDevice: '디바이스 추가',
  resetDefaults: '기본값 복원',
  resetAllSettings: '전체 설정 초기화',
  resetAllSettingsConfirm: '모든 설정을 기본값으로 초기화하시겠습니까? (기본 디렉토리는 유지됩니다)',
  resetAllSettingsSaveReminder: '설정이 초기화되었습니다. 저장 버튼을 눌러야 적용됩니다.',
  unsavedChanges: '저장하지 않은 변경사항이 있습니다. 저장하지 않고 나가시겠습니까?',
  saveChanges: '변경사항 저장',

  // Export Settings
  exportSection: '내보내기',
  jpgQuality: 'JPG 품질',
  jpgQualityDesc: '에피소드 내보내기와 썸네일 캡처에 사용되는 JPEG 압축 품질. 높을수록 화질이 좋지만 파일 크기가 커집니다.',

  // Export
  exportTitle: '에피소드 내보내기',
  exportButton: '에피소드 내보내기',
  exportRun: '내보내기 실행',
  exportRunning: '내보내기 중...',
  exportNoPlatforms: '선택된 플랫폼이 없습니다',
  exportSuccess: '내보내기 완료!',
  exportWarnings: (n: number) => `${n}개 경고`,
  exportFiles: (n: number) => `${n}개 파일 내보냄`,
  exportOpenFolder: '내보내기 폴더 열기',
  exportNoSlices: '슬라이스가 없습니다. 먼저 분할을 실행하세요.',
  exportPlatform: '플랫폼',
  exportWidth: '너비',
  exportFormat: '형식',
  exportMaxSize: '최대 크기',
  exportedBadge: '내보내기 완료',
  exportedAt: (date: string) => `내보내기: ${date}`,

  // Preset Import/Export
  importPresets: '프리셋 가져오기',
  exportPresets: '프리셋 내보내기',
  importPresetsSuccess: '프리셋을 가져왔습니다',
  exportPresetsSuccess: '프리셋을 내보냈습니다',
  importPresetsFailed: '프리셋 가져오기 실패',
  exportPresetsFailed: '프리셋 내보내기 실패',
  platformCount: (n: number) => `${n}개 플랫폼`,

  // Country / Platform names (i18n)
  countryName: (id: string) => {
    const names: Record<string, string> = {
      kr: '한국'
    }
    return names[id] ?? id
  },
  platformName: (id: string) => {
    const names: Record<string, string> = {
      ridi: '리디', alltoon: '올툰', watcha: '왓챠'
    }
    return names[id] ?? id
  },

  // Progress steps
  progressCopyPdf: 'PDF 복사 중...',
  progressCountPages: '페이지 수 확인 중...',
  progressRenderPages: '페이지 렌더링 중...',
  progressSlicing: '이미지 분할 중...',
  progressPreview: '미리보기 생성 중...',
  progressDone: '완료',
  progressExporting: '내보내기 중...',

  // Thumbnail Capture
  thumbnail: '썸네일',
  thumbnailConfirm: '저장',
  thumbnailCancel: '취소',
  thumbnailSuccess: '썸네일 저장 완료',
  thumbnailSuccessUpscaled: (srcW: number, srcH: number) => `썸네일 저장 완료 (${srcW}x${srcH}에서 업스케일)`,
  thumbnailFailed: '썸네일 캡처 실패',
  thumbnailNoPlatforms: '썸네일 스펙이 있는 플랫폼이 없습니다',
  thumbnailOpenFolder: '폴더 열기',

  // Duplicate detection
  toastDuplicateJob: '동일한 설정의 작업이 이미 존재합니다',

  // Toast
  toastJobSuccess: (sliceCount: number) => `분할 완료! ${sliceCount}개 슬라이스 생성`,
  toastJobFailed: '분할 실패',
  toastExportSuccess: (fileCount: number) => `내보내기 완료! ${fileCount}개 파일 내보냄`,
  toastExportFailed: '내보내기 실패',
}

export default ko
