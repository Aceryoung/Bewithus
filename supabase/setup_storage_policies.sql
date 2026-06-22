-- receipts 버킷 스토리지 정책 전체 설정
-- 버킷을 Private으로 생성한 뒤 SQL Editor에서 실행

-- 기존 정책 제거 (중복 방지)
DROP POLICY IF EXISTS "receipts_insert" ON storage.objects;
DROP POLICY IF EXISTS "receipts_select" ON storage.objects;
DROP POLICY IF EXISTS "receipts_delete" ON storage.objects;
DROP POLICY IF EXISTS "receipts_update" ON storage.objects;

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

-- 선생님은 본인 것, 대표는 전체 업데이트 (upsert 시 필요)
CREATE POLICY "receipts_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_app_user_id()::text
      OR is_director()
    )
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = get_app_user_id()::text
      OR is_director()
    )
  );
