-- receipts storage UPDATE 정책 추가
-- upsert: true 사용 시 파일이 이미 존재하면 UPDATE 권한 필요
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
