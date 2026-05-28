-- migration_v1.13_inquiries_delete.sql
-- inquiries 테이블 DELETE 정책 추가

-- v1.12에서 INSERT/SELECT/UPDATE만 정의되어 DELETE가 누락됨
-- RLS 활성화 테이블에서 DELETE 정책이 없으면 모든 삭제 시도가 거부됨

CREATE POLICY "director_delete_inquiry" ON inquiries
  FOR DELETE TO authenticated
  USING (is_director());
