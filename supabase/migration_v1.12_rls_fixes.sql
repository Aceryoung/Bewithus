-- migration_v1.12_rls_fixes.sql
-- RLS 정책 ID 오류 수정

-- ── 1. inquiries 정책 — auth.uid() → 올바른 ID로 수정 ─────────
-- 기존 정책: teacher_id = auth.uid()  → 잘못됨 (auth.uid()는 auth.users.id)
-- 올바른 정책: teacher_id = get_app_user_id() (public.users.id 반환)

DROP POLICY IF EXISTS "teacher_insert_own"  ON inquiries;
DROP POLICY IF EXISTS "teacher_select_own"  ON inquiries;
DROP POLICY IF EXISTS "director_select_all" ON inquiries;
DROP POLICY IF EXISTS "director_update_read" ON inquiries;

CREATE POLICY "teacher_insert_own" ON inquiries
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = get_app_user_id());

CREATE POLICY "teacher_select_own" ON inquiries
  FOR SELECT TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

CREATE POLICY "director_update_read" ON inquiries
  FOR UPDATE TO authenticated
  USING (is_director());

-- ── 2. branch_voucher_config 정책 — director/admin만 쓰기 허용 ─
-- 기존: FOR ALL TO authenticated → 선생님도 수정 가능
-- 수정: SELECT는 전체, 쓰기는 director/admin만

DROP POLICY IF EXISTS "authenticated select" ON branch_voucher_config;
DROP POLICY IF EXISTS "authenticated all"    ON branch_voucher_config;

CREATE POLICY "voucher_select" ON branch_voucher_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "voucher_write" ON branch_voucher_config
  FOR ALL TO authenticated
  USING (is_director())
  WITH CHECK (is_director());

-- ── 3. fee_tables 쓰기 정책 추가 ─────────────────────────────
-- 기존: SELECT만 있음 (쓰기는 RLS 미적용 상태로 허용되던 것)
-- 명시적으로 director/admin만 쓰기 허용

ALTER TABLE fee_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_tables_auth_read" ON fee_tables;

CREATE POLICY "fee_tables_select" ON fee_tables
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fee_tables_write" ON fee_tables
  FOR ALL TO authenticated
  USING (is_director())
  WITH CHECK (is_director());
