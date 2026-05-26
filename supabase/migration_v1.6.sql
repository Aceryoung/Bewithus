-- 기록 수정자 이름 컬럼 추가
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT DEFAULT NULL;
