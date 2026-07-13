-- migration_v1.21_users_rls.sql
-- [H-3] users_auth_read_all 정책 제거
--   기존: 인증된 모든 사용자가 전체 users 테이블 조회 가능 → pin_hash 잔류 시 노출 위험
--   변경: 본인 행(auth_id = auth.uid()) 또는 director/admin만 전체 조회 허용

DROP POLICY IF EXISTS "users_auth_read_all" ON users;

-- 본인 행 조회: auth_id 로 매칭
CREATE POLICY "users_read_own" ON users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

-- director/admin: 전체 조회
CREATE POLICY "users_director_read_all" ON users
  FOR SELECT TO authenticated
  USING (is_director());
