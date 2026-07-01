-- 로그인 실패 잠금을 서버(DB)에서 관리
-- 브라우저 새로고침으로 잠금 우회 방지

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_failed_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;

-- 로그인 실패 기록: 카운트 증가 후 임계치 도달 시 잠금 설정
CREATE OR REPLACE FUNCTION record_login_failure(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
  v_locked_until timestamptz;
BEGIN
  UPDATE users
  SET login_failed_count = login_failed_count + 1
  WHERE id = p_user_id
  RETURNING login_failed_count, login_locked_until INTO v_count, v_locked_until;

  IF v_count >= 5 THEN
    UPDATE users
    SET login_locked_until = NOW() + INTERVAL '30 seconds',
        login_failed_count = 0
    WHERE id = p_user_id
    RETURNING login_locked_until INTO v_locked_until;
  END IF;

  RETURN jsonb_build_object('locked_until', v_locked_until, 'failed_count', v_count);
END;
$$;

-- 로그인 성공 시 초기화
CREATE OR REPLACE FUNCTION reset_login_attempts(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users
  SET login_failed_count = 0, login_locked_until = NULL
  WHERE id = p_user_id;
END;
$$;
