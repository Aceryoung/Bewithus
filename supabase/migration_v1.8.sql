-- migration_v1.8.sql
-- 직급(job_title), 첫 로그인 PIN 변경(pin_must_change), 생년(birth_year), 신규 바우처 타입

-- 1. users 테이블에 job_title, pin_must_change 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_must_change BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. records 테이블에 birth_year 추가
ALTER TABLE records ADD COLUMN IF NOT EXISTS birth_year TEXT DEFAULT NULL;

-- 3. payment_method CHECK 제약 업데이트 (신규 바우처 타입 포함)
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_payment_method_check;
ALTER TABLE records ADD CONSTRAINT records_payment_method_check
  CHECK (payment_method IN (
    'education', 'sports_voucher', 'after_school',
    'card', 'cash', 'bank_transfer', 'other',
    'developmental', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'after_school_fee'
  ));

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_secondary_method_check;
ALTER TABLE records ADD CONSTRAINT records_secondary_method_check
  CHECK (secondary_method IS NULL OR secondary_method IN (
    'education', 'sports_voucher', 'after_school',
    'card', 'cash', 'bank_transfer', 'other',
    'developmental', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'after_school_fee'
  ));

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_tertiary_method_check;
ALTER TABLE records ADD CONSTRAINT records_tertiary_method_check
  CHECK (tertiary_method IS NULL OR tertiary_method IN (
    'education', 'sports_voucher', 'after_school',
    'card', 'cash', 'bank_transfer', 'other',
    'developmental', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'after_school_fee'
  ));

-- 4. 기존 직원 job_title 설정
-- 1호점 비위더스
UPDATE users SET job_title = '대표' WHERE name = '박승용';
UPDATE users SET job_title = '주임' WHERE name = '김인윤';
UPDATE users SET job_title = '사원' WHERE name = '심건우';
UPDATE users SET job_title = '사원' WHERE name = '손세훈';
-- 2호점 운동발달연구소
UPDATE users SET job_title = '소장' WHERE name = '김경호';
UPDATE users SET job_title = '팀장' WHERE name = '예나연';
UPDATE users SET job_title = '연구원' WHERE name = '노주엽';
UPDATE users SET job_title = '연구원' WHERE name = '이나경';

-- 5. reset_teacher_pin RPC 업데이트: PIN 초기화 시 pin_must_change = true 설정
CREATE OR REPLACE FUNCTION reset_teacher_pin(p_teacher_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_id UUID;
  v_email TEXT;
BEGIN
  SELECT auth_id INTO v_auth_id FROM users WHERE id = p_teacher_id;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Auth ID not found for teacher';
  END IF;

  v_email := 'user_' || p_teacher_id || '@bewithus.internal';

  -- Supabase admin API로 비밀번호 변경 (0000@bw)
  UPDATE auth.users
  SET encrypted_password = crypt('0000@bw', gen_salt('bf'))
  WHERE id = v_auth_id;

  -- pin_must_change 플래그 설정
  UPDATE users SET pin_must_change = true WHERE id = p_teacher_id;
END;
$$;
