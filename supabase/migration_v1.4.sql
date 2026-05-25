-- ============================================================
-- bewithus-emr migration v1.4
-- 1. 보조 결제방식 및 보조 지원금 컬럼 추가
-- 2. 남은지원금 메모 컬럼 추가
-- ============================================================

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS secondary_method TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS secondary_support INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_support INT NOT NULL DEFAULT 0;
