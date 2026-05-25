-- migration_v1.5: 보조 결제방식 복수 선택 지원 (tertiary 컬럼 추가)
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS tertiary_method TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tertiary_support INT NOT NULL DEFAULT 0;
