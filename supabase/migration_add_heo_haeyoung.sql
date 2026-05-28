-- 허해영 관리자 계정 추가
-- 호점: 1호점 / 역할: admin / 초기 PIN: 0000 (첫 로그인 시 강제 변경)

DO $$
DECLARE
  v_uid     UUID;
  v_auth_id UUID;
  v_branch_id UUID;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE name = '1호점';

  -- 이미 존재하면 스킵
  SELECT id INTO v_uid FROM public.users WHERE name = '허해영';

  IF v_uid IS NULL THEN
    v_uid     := gen_random_uuid();
    v_auth_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_uid::text || '@bewithus.internal',
      crypt('0000@bw', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}', '{}', false
    );

    INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      v_uid::text || '@bewithus.internal',
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_uid::text || '@bewithus.internal'),
      'email',
      NOW(), NOW(), NOW()
    );

    INSERT INTO public.users (id, auth_id, name, role, job_title, branch_id, is_active, pin_must_change)
    VALUES (v_uid, v_auth_id, '허해영', 'admin', '관리자', v_branch_id, true, true);

    RAISE NOTICE '[생성] 허해영 | admin | 관리자 | 1호점';
  ELSE
    -- 이미 있으면 역할·직급만 업데이트
    UPDATE public.users SET
      role          = 'admin',
      job_title     = '관리자',
      branch_id     = v_branch_id,
      is_active     = true,
      pin_must_change = true
    WHERE id = v_uid;

    RAISE NOTICE '[업데이트] 허해영 | admin | 관리자 | 1호점';
  END IF;
END $$;
