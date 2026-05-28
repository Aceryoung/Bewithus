-- migration_v1.10_voucher_config.sql
-- 지점별 지원금(바우처) 설정 테이블
-- 관리자가 앱에서 직접 지원금 종류·월 한도를 추가/수정할 수 있도록 DB화

CREATE TABLE IF NOT EXISTS branch_voucher_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  monthly_limit INTEGER NOT NULL DEFAULT 0,   -- 0 = 한도 없음
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, payment_method)
);

ALTER TABLE branch_voucher_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated select" ON branch_voucher_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated all" ON branch_voucher_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 기존 상수(BRANCH_VOUCHER_CONFIG) 값으로 초기 데이터 삽입
DO $$
DECLARE
  b1 UUID;
  b2 UUID;
BEGIN
  SELECT id INTO b1 FROM branches WHERE name = '1호점';
  SELECT id INTO b2 FROM branches WHERE name = '2호점';

  IF b1 IS NOT NULL THEN
    INSERT INTO branch_voucher_config (branch_id, payment_method, monthly_limit) VALUES
      (b1, 'developmental',   0),
      (b1, 'sports_voucher',  120000),
      (b1, 'disabled_sports', 110000),
      (b1, 'senior_voucher',  0),
      (b1, 'sci_rehab',       0),
      (b1, 'education',       0),
      (b1, 'after_school_fee',0)
    ON CONFLICT (branch_id, payment_method) DO NOTHING;
  END IF;

  IF b2 IS NOT NULL THEN
    INSERT INTO branch_voucher_config (branch_id, payment_method, monthly_limit) VALUES
      (b2, 'education',     160000),
      (b2, 'sports_voucher',130000),
      (b2, 'after_school',  120000)
    ON CONFLICT (branch_id, payment_method) DO NOTHING;
  END IF;
END $$;
