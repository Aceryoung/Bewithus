-- ============================================================
-- bewithus-emr migration v1.2
-- 1. admin 역할 지원 (users role CHECK 업데이트)
-- 2. is_director() admin 포함으로 업데이트
-- 3. 성능 인덱스 추가
-- ============================================================

-- ── 1. admin 역할 지원 ────────────────────────────────────────
-- users 테이블의 role CHECK 제약에 'admin' 추가
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('director', 'teacher', 'admin'));


-- ── 2. is_director() 함수 업데이트 ───────────────────────────
-- director + admin 모두 대표 권한으로 처리
CREATE OR REPLACE FUNCTION is_director()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role IN ('director', 'admin')
      AND is_active = TRUE
  );
$$;


-- ── 3. 성능 인덱스 ────────────────────────────────────────────

-- records: 날짜+지점 조회 (대표 일별/월별 뷰)
CREATE INDEX IF NOT EXISTS idx_records_branch_date
  ON records (branch_id, date DESC);

-- records: 선생님 본인 기록 조회 (선생님 월별 뷰, 지원금 누적 계산)
CREATE INDEX IF NOT EXISTS idx_records_teacher_date
  ON records (teacher_id, date DESC);

-- records: 환자별 월 지원금 누적 계산 (DailyInputPage monthlyUsed)
CREATE INDEX IF NOT EXISTS idx_records_patient_date
  ON records (patient_name, date DESC);

-- users: 세션 복원 쿼리 (auth_id → users 조회, 매 페이지 진입마다 실행)
CREATE INDEX IF NOT EXISTS idx_users_auth_id
  ON users (auth_id)
  WHERE auth_id IS NOT NULL;

-- makeup_sessions: 선생님 보강 목록 (pending 필터링)
CREATE INDEX IF NOT EXISTS idx_makeup_teacher_status
  ON makeup_sessions (teacher_id, status);

-- fee_tables: 지점별 활성 요금표 (DailyInputPage 로드)
CREATE INDEX IF NOT EXISTS idx_fee_tables_branch_active
  ON fee_tables (branch_id, is_active)
  WHERE is_active = TRUE;
