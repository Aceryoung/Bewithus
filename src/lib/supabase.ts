import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.')
}

// 메인 클라이언트: 세션 유지 (디렉터/선생님 로그인 세션)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

/**
 * 임시 클라이언트 팩토리 (세션 비저장)
 *
 * 대표가 선생님 계정을 생성하거나 PIN 변경 시 사용.
 * 이 클라이언트의 signUp/signIn 결과는 localStorage에 기록되지 않으므로
 * 현재 로그인 중인 대표의 세션에 전혀 영향을 주지 않음.
 *
 * 사용 후 별도의 signOut 없이 버려도 안전함.
 */
export function createTempClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      // no-op storage: 세션 정보를 localStorage에 쓰지 않음
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  })
}

/**
 * users.id 로부터 Supabase Auth 가상 이메일 생성
 * 패턴: {users_uuid}@bewithus.internal
 */
export function userEmail(userId: string): string {
  return `${userId}@bewithus.internal`
}

/**
 * PIN + 고정 suffix → Supabase Auth 비밀번호 (최소 길이 충족용)
 * Supabase Auth 기본 최소 비밀번호 길이는 6자.
 * PIN은 4자리이므로 "@bw" suffix를 붙여 7자로 만듦.
 *
 * ⚠ 이 suffix는 클라이언트 코드에 노출됩니다.
 *   완전한 서버 사이드 인증이 필요하다면 Edge Function으로 이관하세요.
 */
export function pinToPassword(pin: string): string {
  return `${pin}@bw`
}
