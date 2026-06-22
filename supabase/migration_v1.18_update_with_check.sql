-- migration_v1.18_update_with_check.sql
-- records / makeup_sessions UPDATE 정책에 WITH CHECK 추가
-- 기존 정책은 USING만 있어 선생님이 teacher_id를 다른 선생님으로 변경 가능했음

DROP POLICY IF EXISTS "records_update" ON records;
CREATE POLICY "records_update" ON records
  FOR UPDATE TO authenticated
  USING     (teacher_id = get_app_user_id() OR is_director())
  WITH CHECK (teacher_id = get_app_user_id() OR is_director());

DROP POLICY IF EXISTS "makeup_update" ON makeup_sessions;
CREATE POLICY "makeup_update" ON makeup_sessions
  FOR UPDATE TO authenticated
  USING     (teacher_id = get_app_user_id() OR is_director())
  WITH CHECK (teacher_id = get_app_user_id() OR is_director());
