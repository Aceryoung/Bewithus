-- migration_v1.11_fixes.sql
-- 전수 조사 결과 발견된 오류 수정

-- ── 1. is_director(): admin 역할 포함 ─────────────────────────
-- 기존 함수가 role = 'director'만 허용 → admin은 직원 추가/삭제 불가
CREATE OR REPLACE FUNCTION is_director()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role IN ('director', 'admin')
      AND is_active = TRUE
  );
$$;

-- ── 2. users 테이블 role CHECK 제약 — admin 포함 ──────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('director', 'teacher', 'admin'));

-- ── 3. records.billing_month 컬럼 — 누락 시 추가 ─────────────
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS billing_month TEXT DEFAULT NULL;

-- ── 4. delete_auth_user_by_id: public.users insert 실패 시 고아 auth 계정 정리 ──
CREATE OR REPLACE FUNCTION delete_auth_user_by_id(p_auth_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM auth.identities WHERE user_id = p_auth_id;
  DELETE FROM auth.users WHERE id = p_auth_id;
END;
$$;

-- ── 5. records.session_count — INTEGER → NUMERIC(4,1) ─────────
-- 0.5 단위 입력(보조기구 등 분할 세션)을 지원하기 위해 타입 변경
ALTER TABLE records
  ALTER COLUMN session_count TYPE NUMERIC(4,1) USING session_count::NUMERIC(4,1);

ALTER TABLE records
  DROP CONSTRAINT IF EXISTS records_session_count_check;

ALTER TABLE records
  ADD CONSTRAINT records_session_count_check
  CHECK (session_count >= 0.5 AND session_count <= 16);
