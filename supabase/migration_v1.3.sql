-- ============================================================
-- bewithus-emr migration v1.3
-- 1. delete_teacher_account: users + auth.users 동시 삭제 (보안)
-- ============================================================

-- SECURITY DEFINER 함수 → postgres 권한으로 auth.users 삭제 가능
CREATE OR REPLACE FUNCTION delete_teacher_account(p_teacher_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth_id UUID;
BEGIN
  -- 호출자가 director/admin인지 확인
  IF NOT is_director() THEN
    RAISE EXCEPTION 'Unauthorized: director role required';
  END IF;

  -- auth_id 조회
  SELECT auth_id INTO v_auth_id FROM users WHERE id = p_teacher_id;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_teacher_id;
  END IF;

  -- users 테이블 삭제 (연관 records는 DB cascade 정책에 따라 처리)
  DELETE FROM public.users WHERE id = p_teacher_id;

  -- Supabase Auth 계정 삭제
  DELETE FROM auth.users WHERE id = v_auth_id;
END;
$$;
