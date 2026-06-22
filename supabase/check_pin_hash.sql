-- pin_hash 잔류 여부 확인 (Supabase SQL Editor에서 실행)
-- 결과가 있으면 해당 계정의 pin_hash를 NULL로 정리 필요

SELECT name, role, branch_id, pin_hash IS NOT NULL AS has_pin_hash
FROM users
WHERE pin_hash IS NOT NULL;

-- 잔류 계정이 있다면 아래 실행:
-- UPDATE users SET pin_hash = NULL WHERE auth_id IS NOT NULL AND pin_hash IS NOT NULL;
