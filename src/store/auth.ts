import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  login: (userId: string, pin: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
}

/** PIN → SHA-256 hex (로그인 페이지 및 verify_pin RPC용) */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

      /**
       * 로그인 플로우
       *
       * 1) Supabase Auth signInWithPassword 시도 (기존 Auth 계정 있는 경우)
       * 2) 실패 시 → verify_pin RPC 로 pin_hash 검증 (최초 로그인 / 마이그레이션)
       *    성공하면 tempClient 로 Supabase Auth 계정 자동 생성 → 재로그인
       * 3) users 테이블에 auth_id 연결 (1회)
       */
      login: async (userId: string, pin: string) => {
        const email = userEmail(userId)
        const password = pinToPassword(pin)

        // ── 케이스 A: 이미 Supabase Auth 계정 존재 ──
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (!signInError) {
          return finishLogin(userId, set)
        }

        // ── 케이스 B: Auth 계정 없음 → pin_hash 로 검증 후 자동 생성 ──
        const pinHash = await hashPin(pin)
        const { data: isValid } = await supabase.rpc('verify_pin', {
          p_user_id: userId,
          p_pin_hash: pinHash,
        })

        if (!isValid) {
          return { error: 'PIN이 올바르지 않습니다.' }
        }

        // 임시 클라이언트로 Supabase Auth 계정 생성 (대표 세션에 영향 없음)
        const tmp = createTempClient()
        const { data: signUpData, error: signUpError } = await tmp.auth.signUp({
          email,
          password,
        })

        if (signUpError || !signUpData.user) {
          // email confirmation이 켜져 있으면 signUpData.session 이 null 로 옴
          if (signUpData?.user && !signUpData.session) {
            return {
              error:
                'Supabase Auth 설정 오류: Authentication > Settings에서 "Enable email confirmations"를 OFF로 변경하세요.',
            }
          }
          return { error: `계정 생성 실패: ${signUpError?.message ?? '알 수 없는 오류'}` }
        }

        // auth_id 연결 (최초 1회)
        const { error: linkError } = await supabase
          .from('users')
          .update({ auth_id: signUpData.user.id, pin_hash: null }) // pin_hash 즉시 소거
          .eq('id', userId)
        if (linkError) {
          return { error: `계정 연결 실패: ${linkError.message}` }
        }

        // 메인 클라이언트로 정식 로그인
        const { error: reSignInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (reSignInError) {
          return { error: `로그인 재시도 실패: ${reSignInError.message}` }
        }

        return finishLogin(userId, set)
      },

      logout: async () => {
        await supabase.auth.signOut()
        set({ user: null })
      },

      /**
       * 앱 재진입 시 Supabase Auth 세션 복원
       * App.tsx onAuthStateChange 또는 첫 렌더에서 호출
       */
      restoreSession: async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          set({ user: null })
          return
        }

        // auth.uid() 로 users 테이블 조회
        const { data: profile } = await supabase
          .from('users')
          .select('id, name, role, job_title, branch_id, is_active, pin_must_change, branch:branches(name)')
          .eq('auth_id', session.user.id)
          .single()

        if (profile?.is_active) {
          const branch_name = (profile.branch as unknown as { name: string } | null)?.name ?? null
          set({ user: { ...profile, job_title: profile.job_title ?? null, branch_name, pin_must_change: profile.pin_must_change ?? false, login_failed_count: 0, login_locked_until: null, created_at: '' } as User })
        } else {
          // signOut 대신 user만 초기화 — signOut이 SIGNED_OUT 이벤트를 발생시켜
          // 로그인 진행 중인 LoginPage를 리마운트시키는 race condition 방지
          set({ user: null })
        }
      },
    }),
    {
      name: 'bewithus-auth',
      // token 필드 제거: Supabase Auth 가 JWT를 직접 관리함
      partialize: (state) => ({ user: state.user }),
    },
  ),
)

/** 로그인 성공 후 공통 프로필 로드 + auth_id 미연결 시 자동 연결 */
async function finishLogin(
  userId: string,
  set: (partial: Partial<AuthState>) => void,
): Promise<{ error: string | null }> {
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, name, role, job_title, branch_id, is_active, auth_id, pin_must_change, branch:branches(name)')
    .eq('id', userId)
    .single()

  if (error || !profile?.is_active) {
    await supabase.auth.signOut()
    return { error: '사용할 수 없는 계정입니다.' }
  }

  // auth_id가 아직 연결되지 않은 경우 현재 세션으로 자동 연결
  if (!profile.auth_id) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user.id) {
      await supabase.from('users')
        .update({ auth_id: session.user.id, pin_hash: null })
        .eq('id', userId)
    }
  }

  const { id, name, role, job_title, branch_id, is_active, pin_must_change } = profile
  const branch_name = (profile.branch as unknown as { name: string } | null)?.name ?? null
  set({ user: { id, name, role, job_title: job_title ?? null, branch_id, branch_name, is_active, pin_must_change: pin_must_change ?? false, created_at: '' } as User })
  return { error: null }
}
