-- migration_v1.20_dos_fix.sql
-- [C-1] record_login_failure anon DoS 차단
--   - record_login_failure/reset_login_attempts를 authenticated 전용으로 제한
--   - verify_pin을 jsonb 반환으로 변경 → 잠금 추적을 함수 내부로 통합
--   - get_active_users에 login_locked_until 추가 (UI 초기 잠금 표시용)

-- ── 1. DoS 벡터 차단 ─────────────────────────────────────────────
-- anon이 임의 user_id로 호출해 전체 계정을 잠글 수 있었던 경로 제거
REVOKE EXECUTE ON FUNCTION record_login_failure(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_login_failure(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION reset_login_attempts(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reset_login_attempts(uuid) TO authenticated;

-- ── 2. verify_pin: jsonb 반환 + 잠금 추적 통합 ───────────────────
-- 기존: BOOLEAN 반환, 잠금 추적 없음
-- 변경: jsonb 반환 { valid, locked_until, failed_count }
--       pin_hash가 있는 마이그레이션 계정에서만 잠금 추적 수행
--       (pin_hash=NULL인 Auth 계정은 Supabase Auth 자체 레이트리밋에 의존)
-- 반환 타입이 바뀌므로 DROP 후 재생성 (CREATE OR REPLACE 불가)
DROP FUNCTION IF EXISTS verify_pin(UUID, TEXT);
CREATE FUNCTION verify_pin(p_user_id UUID, p_pin_hash TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pin_hash       TEXT;
  v_is_active      BOOLEAN;
  v_locked_until   TIMESTAMPTZ;
  v_count          INT;
BEGIN
  SELECT pin_hash, is_active, login_locked_until, login_failed_count
  INTO v_pin_hash, v_is_active, v_locked_until, v_count
  FROM users WHERE id = p_user_id;

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN jsonb_build_object('valid', false, 'locked_until', null, 'failed_count', 0);
  END IF;

  -- Auth 계정으로 마이그레이션 완료 (pin_hash=NULL)
  -- → 잠금 추적은 Supabase Auth 담당, 여기서는 처리 안 함
  IF v_pin_hash IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'locked_until', null, 'failed_count', 0);
  END IF;

  -- 잠금 상태 확인
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN jsonb_build_object('valid', false, 'locked_until', v_locked_until, 'failed_count', 0);
  END IF;

  IF v_pin_hash = p_pin_hash THEN
    UPDATE users SET login_failed_count = 0, login_locked_until = NULL WHERE id = p_user_id;
    RETURN jsonb_build_object('valid', true, 'locked_until', null, 'failed_count', 0);
  ELSE
    UPDATE users
    SET login_failed_count = login_failed_count + 1
    WHERE id = p_user_id
    RETURNING login_failed_count, login_locked_until INTO v_count, v_locked_until;

    IF v_count >= 5 THEN
      UPDATE users
      SET login_locked_until = NOW() + INTERVAL '30 seconds',
          login_failed_count  = 0
      WHERE id = p_user_id
      RETURNING login_locked_until INTO v_locked_until;
    END IF;

    RETURN jsonb_build_object('valid', false, 'locked_until', v_locked_until, 'failed_count', v_count);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION verify_pin(UUID, TEXT) TO anon;

-- ── 3. get_active_users: login_locked_until 추가 ─────────────────
-- UI 초기 렌더(페이지 로드)에서 이미 잠긴 계정 표시용
DROP FUNCTION IF EXISTS get_active_users();
CREATE FUNCTION get_active_users()
RETURNS TABLE(id UUID, name TEXT, role TEXT, branch_id UUID, login_locked_until TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, name, role, branch_id, login_locked_until
  FROM users
  WHERE is_active = TRUE
  ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION get_active_users() TO anon;
