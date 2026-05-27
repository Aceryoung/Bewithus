-- migration_v1.9_accounts.sql
-- 직원 계정 생성 (없으면 생성, 있으면 직급/PIN 업데이트)
-- 초기 PIN: 0000 / 첫 로그인 시 PIN 변경 강제

DO $$
DECLARE
  rec RECORD;
  v_uid UUID;
  v_auth_id UUID;
  v_branch_id UUID;
BEGIN
  FOR rec IN (
    SELECT * FROM (VALUES
      ('박승용', 'director', '대표',   '1호점'),
      ('김인윤', 'teacher',  '주임',   '1호점'),
      ('심건우', 'teacher',  '사원',   '1호점'),
      ('손세훈', 'teacher',  '사원',   '1호점'),
      ('김경호', 'teacher',  '소장',   '2호점'),
      ('예나연', 'teacher',  '팀장',   '2호점'),
      ('노주엽', 'teacher',  '연구원', '2호점'),
      ('이나경', 'teacher',  '연구원', '2호점')
    ) AS t(uname, urole, ujob, ubranch)
  ) LOOP

    SELECT id INTO v_branch_id FROM public.branches WHERE name = rec.ubranch;
    SELECT id, auth_id INTO v_uid, v_auth_id FROM public.users WHERE name = rec.uname;

    IF v_uid IS NULL THEN
      -- ── 신규 계정 생성 ──────────────────────────────────────
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
        'user_' || v_uid::text || '@bewithus.internal',
        crypt('0000@bw', gen_salt('bf')),
        NOW(), NOW(), NOW(),
        '{"provider":"email","providers":["email"]}', '{}', false
      );

      -- auth.identities 없으면 signInWithPassword가 실패하므로 반드시 삽입
      INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        v_auth_id,
        jsonb_build_object('sub', v_auth_id::text, 'email', 'user_' || v_uid::text || '@bewithus.internal'),
        'email',
        NOW(), NOW(), NOW()
      );

      INSERT INTO public.users (id, auth_id, name, role, job_title, branch_id, is_active, pin_must_change)
      VALUES (v_uid, v_auth_id, rec.uname, rec.urole, rec.ujob, v_branch_id, true, true);

      RAISE NOTICE '[생성] % | % | % | %', rec.uname, rec.urole, rec.ujob, rec.ubranch;

    ELSE
      -- ── 기존 계정 업데이트 (직급, PIN 초기화) ───────────────
      UPDATE public.users SET
        job_title     = rec.ujob,
        role          = rec.urole,
        pin_must_change = true,
        is_active     = true
      WHERE id = v_uid;

      IF v_auth_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = crypt('0000@bw', gen_salt('bf'))
        WHERE id = v_auth_id;
      END IF;

      RAISE NOTICE '[업데이트] % | % | % | %', rec.uname, rec.urole, rec.ujob, rec.ubranch;
    END IF;

  END LOOP;
END $$;
