# Changelog

## [Unreleased]

## [1.15.0] — 2026-06-22

### Security
- **receipts Storage 버킷을 Public → Private 전환 대응**: 영수증 이미지 URL을 직접 노출하는 방식에서 서명된 임시 URL(1시간 유효) 방식으로 전환
  - `uploadReceipt()` 반환값을 공개 URL → 스토리지 경로(`{teacherId}/{recordId}.jpg`)로 변경
  - `getReceiptSignedUrl(pathOrUrl)` 함수 추가 — 레거시 공개 URL과 경로 모두 처리 (`src/lib/storage.ts`)
  - 영수증 표시 4곳(`PatientSearchModal`, `PatientSearchPage`, `DirectorRecordsPage`, `RecordEditSheet`)에서 서명된 URL 사용
  - **남은 조치**: Supabase 대시보드에서 receipts 버킷을 Private으로 직접 변경 필요
- **RLS UPDATE 정책 강화** (`supabase/migration_v1.18_update_with_check.sql`)
  - `records`, `makeup_sessions` UPDATE 정책에 `WITH CHECK` 추가
  - 기존에는 선생님이 자신의 기록 `teacher_id`를 타 선생님 UUID로 변경 가능했던 문제 차단

## [1.14.0] — 2026-06-05

### Fixed
- **ERR-101** 버그: session_count 상한(16회) 검증 누락으로 DB 제약 조건 위반 발생 (`d619742`)
  - `RecordFormFields`, `PaymentPage` 건수 입력 필드에 `Math.min(16, ...)` 및 `max={16}` 추가

### Improved
- DB 제약 조건 위반 시 사용자에게 영어 PostgreSQL 에러 대신 한국어 안내 메시지 표시 (`302e933`)
  - `friendlyDbError()` 함수 추가 (`src/lib/appErrors.ts`)
  - ERR-101, ERR-102, ERR-103 에러 모달에 적용

## [1.13.0] — 2026-06-02

### Fixed
- 웨일 브라우저 마우스 제스처가 `‹` `›` 유니코드 문자를 페이지 이동으로 인식하는 문제 (`81bf3e9`)
  - `CalendarView`, `MonthPicker`, `MonthlyViewPage`, `DirectorRecordsPage`의 네비게이션 버튼을 SVG 아이콘으로 교체
- PWA 신버전 배포 시 구버전 캐시가 남아 자동 새로고침되지 않는 문제 (`433cb14`)
- DayRecordsSheet 모바일/웹 팝업 위치 불일치 (`fd48819`, `68d3b6f`)

### Added
- 달력 및 월별 페이지에 월 선택 팝업(MonthPicker) 추가 (`e3dc09e`)
- 엑셀 내보내기에 청구 월 컬럼 추가 (`d3cee70`)
- 달력 날짜 클릭 후 건수 입력 시 해당 날짜 자동 설정 (`23601df`)
