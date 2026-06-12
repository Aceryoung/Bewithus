-- migration_v1.17_remove_session_count_limit.sql
-- records.session_count 상한(16) 제약 제거

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_session_count_check;
ALTER TABLE records ADD CONSTRAINT records_session_count_check
  CHECK (session_count >= 0.5);
