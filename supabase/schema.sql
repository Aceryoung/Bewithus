-- ============================================================
-- 예나연 수중운동 클리닉 EMR  v1.1
-- Supabase Auth + 적절한 RLS 적용
-- ============================================================

-- ── 기본 테이블 ──────────────────────────────────────────────

CREATE TABLE branches (
  id   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_tables (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  fee_type  TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- users.id  : 우리 앱의 안정적 UUID (records.teacher_id FK 등 모든 외래 키)
-- users.auth_id : Supabase Auth 사용자 UUID (JWT의 sub claim)
--   최초 로그인 전에는 NULL. 첫 PIN 로그인 시 자동으로 채워짐.
-- pin_hash  : 최초 로그인 전 PIN 검증용 (SHA-256). 마이그레이션 완료 후 NULL 로 초기화.
CREATE TABLE users (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id   UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('director', 'teacher')),
  branch_id UUID REFERENCES branches(id),
  pin_hash  TEXT,         -- 마이그레이션 전용, 첫 Auth 로그인 후 NULL 처리 권장
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE records (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id      UUID NOT NULL REFERENCES branches(id),
  date           DATE NOT NULL,
  patient_name   TEXT NOT NULL,
  attendance     TEXT NOT NULL CHECK (attendance IN ('present', 'absent', 'makeup')),
  fee_type       TEXT NOT NULL,
  session_count  INTEGER NOT NULL CHECK (session_count >= 1 AND session_count <= 8),
  unit_price     INTEGER NOT NULL DEFAULT 0,
  total_amount   INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('education','sports_voucher','after_school','card','cash','bank_transfer','other')),
  payment_note   TEXT,
  support_amount INTEGER NOT NULL DEFAULT 0,
  self_payment   INTEGER NOT NULL DEFAULT 0,
  receipt_url    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE makeup_sessions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_name   TEXT NOT NULL,
  absent_date    DATE NOT NULL,
  reason         TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── RLS 활성화 ────────────────────────────────────────────────

ALTER TABLE branches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_tables     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE makeup_sessions ENABLE ROW LEVEL SECURITY;


-- ── 헬퍼 함수 (SECURITY DEFINER: 호출자 권한 무관하게 실행) ──

-- auth.uid() → users.id 변환 (JWT sub → 앱 사용자 UUID)
CREATE OR REPLACE FUNCTION get_app_user_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM users
  WHERE auth_id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

-- 현재 로그인 사용자가 대표(director)인지 확인
CREATE OR REPLACE FUNCTION is_director()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid() AND role = 'director' AND is_active = TRUE
  );
$$;

-- ── 로그인 페이지용 Public RPC (anon 호출 가능, pin_hash 비노출) ──
-- 사용처: LoginPage 에서 호점별 선생님 목록 표시
CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(id UUID, name TEXT, role TEXT, branch_id UUID)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, name, role, branch_id FROM users WHERE is_active = TRUE ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION get_active_users() TO anon;

-- 최초 로그인: pin_hash 검증 (SECURITY DEFINER → anon이 직접 pin_hash 읽기 불가)
-- 성공 시 true 반환, 실패 시 false. 검증 후 클라이언트에서 Supabase Auth 계정 생성.
CREATE OR REPLACE FUNCTION verify_pin(p_user_id UUID, p_pin_hash TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
      AND pin_hash = p_pin_hash
      AND is_active = TRUE
  );
$$;
GRANT EXECUTE ON FUNCTION verify_pin(UUID, TEXT) TO anon;


-- ── RLS 정책 ─────────────────────────────────────────────────

-- branches / fee_tables: 모든 인증 사용자 읽기
CREATE POLICY "branches_auth_read"   ON branches    FOR SELECT TO authenticated USING (true);
CREATE POLICY "fee_tables_auth_read" ON fee_tables  FOR SELECT TO authenticated USING (true);

-- branches: anon도 읽기 (로그인 페이지 호점 목록 표시)
CREATE POLICY "branches_anon_read"   ON branches    FOR SELECT TO anon USING (true);

-- users: anon은 직접 접근 불가 (pin_hash 노출 방지 → get_active_users() RPC 경유)
CREATE POLICY "users_auth_read_all"     ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_director_insert"   ON users FOR INSERT TO authenticated WITH CHECK (is_director());
CREATE POLICY "users_director_update"   ON users FOR UPDATE TO authenticated USING (is_director());
CREATE POLICY "users_director_delete"   ON users FOR DELETE TO authenticated USING (is_director());
-- ※ 자신의 auth_id는 본인이 업데이트 가능 (최초 로그인 시 auth_id 연결)
CREATE POLICY "users_self_update_auth_id" ON users
  FOR UPDATE TO authenticated
  USING (id = get_app_user_id())
  WITH CHECK (id = get_app_user_id());

-- records: 선생님은 본인 것만, 대표는 전체 (anon 접근 없음)
CREATE POLICY "records_read" ON records
  FOR SELECT TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

CREATE POLICY "records_insert" ON records
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = get_app_user_id());

CREATE POLICY "records_update" ON records
  FOR UPDATE TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

CREATE POLICY "records_delete" ON records
  FOR DELETE TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

-- makeup_sessions: records 와 동일 규칙
CREATE POLICY "makeup_read" ON makeup_sessions
  FOR SELECT TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

CREATE POLICY "makeup_insert" ON makeup_sessions
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = get_app_user_id());

CREATE POLICY "makeup_update" ON makeup_sessions
  FOR UPDATE TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());

CREATE POLICY "makeup_delete" ON makeup_sessions
  FOR DELETE TO authenticated
  USING (teacher_id = get_app_user_id() OR is_director());


-- ── 시드 데이터 ───────────────────────────────────────────────

INSERT INTO branches (id, name) VALUES
  ('11111111-0000-0000-0000-000000000001', '1호점'),
  ('22222222-0000-0000-0000-000000000002', '2호점');

INSERT INTO fee_tables (branch_id, fee_type, unit_price) VALUES
  ('11111111-0000-0000-0000-000000000001', '신경계',    66000),
  ('11111111-0000-0000-0000-000000000001', '근골격계',  77000),
  ('11111111-0000-0000-0000-000000000001', '소아',      60000),
  ('22222222-0000-0000-0000-000000000002', '소아수중1',   65000),
  ('22222222-0000-0000-0000-000000000002', '소아수중1.5', 97500),
  ('22222222-0000-0000-0000-000000000002', '소아매트',   60000);

-- 대표 계정 (auth_id = NULL → 첫 로그인 시 자동 연결)
-- PIN "0000" SHA-256: 9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0
INSERT INTO users (id, name, role, branch_id, pin_hash) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '대표', 'director', NULL,
   '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0');

-- ── 영수증 이미지 Storage 설정 ──────────────────────────────────
-- Supabase 대시보드 > Storage > New bucket
--   Name: receipts
--   Public: ON (경로가 UUID 기반이므로 보안상 충분)
--
-- Storage Policies (SQL Editor에서 실행):

-- 선생님은 자신의 폴더에만 업로드 가능
CREATE POLICY "receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = get_app_user_id()::text
  );

-- 선생님은 본인 것, 대표는 전체 조회
CREATE POLICY "receipts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_app_user_id()::text
      OR is_director()
    )
  );

-- 선생님은 본인 것, 대표는 전체 삭제
CREATE POLICY "receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_app_user_id()::text
      OR is_director()
    )
  );

-- ── 기존 DB에 영수증 컬럼 추가 마이그레이션 ─────────────────────
-- 이미 운영 중인 DB에 적용 시 아래 실행:
-- ALTER TABLE records ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- ── 초기 설정 안내 (SQL 실행 후 Supabase 대시보드에서) ──────────
-- 1. Authentication > Settings > "Enable email confirmations" 를 OFF
-- 2. "Minimum password length" 를 4 이상으로 설정 (기본 6 → 4로 변경)
-- 위 설정 후 앱에서 첫 로그인하면 Supabase Auth 계정이 자동 생성됩니다.
