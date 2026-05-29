-- secondary_method / tertiary_method CHECK 제약 제거
-- 지원금 관리에서 커스텀 이름 자유 입력을 허용하면서
-- 고정 목록 외 값도 저장 가능해야 하므로 제약 해제
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_secondary_method_check;
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_tertiary_method_check;
