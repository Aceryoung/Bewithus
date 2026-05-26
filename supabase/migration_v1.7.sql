-- 문의함 테이블
CREATE TABLE IF NOT EXISTS inquiries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID        NOT NULL REFERENCES users(id),
  teacher_name TEXT        NOT NULL,
  error_code   TEXT        DEFAULT NULL,
  message      TEXT        NOT NULL,
  is_read      BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- 선생님: 본인 문의 등록 + 조회
CREATE POLICY "teacher_insert_own" ON inquiries
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "teacher_select_own" ON inquiries
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- 대표/관리자: 전체 조회 + 읽음 처리
CREATE POLICY "director_select_all" ON inquiries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );

CREATE POLICY "director_update_read" ON inquiries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('director', 'admin')
    )
  );
