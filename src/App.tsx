import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import LoginPage from '@/pages/auth/LoginPage'
import TeacherDashboard from '@/pages/teacher/TeacherDashboard'
import DailyInputPage from '@/pages/teacher/DailyInputPage'
import MonthlyViewPage from '@/pages/teacher/MonthlyViewPage'
import PaymentPage from '@/pages/teacher/PaymentPage'
import DirectorDashboard from '@/pages/director/DirectorDashboard'
import DirectorRecordsPage from '@/pages/director/DirectorRecordsPage'
import AccountsPage from '@/pages/director/AccountsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ children, role }: { children: React.ReactNode; role: string }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/director" replace />
  return <>{children}</>
}

function RequireDirector({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'director' && user.role !== 'admin') return <Navigate to="/teacher" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  // Supabase Auth 세션 변화 감지: 탭 재진입·토큰 갱신 등에 대응
  useEffect(() => {
    // 앱 최초 로드 시 세션 복원
    restoreSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ user: null })
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        restoreSession()
      }
    })

    return () => subscription.unsubscribe()
  }, [restoreSession])

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={user.role === 'director' || user.role === 'admin' ? '/director' : '/teacher'} replace />
            ) : (
              <LoginPage />
            )
          }
        />

        {/* 선생님 라우트 */}
        <Route path="/teacher"          element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
        <Route path="/teacher/input"    element={<RequireAuth><DailyInputPage /></RequireAuth>} />
        <Route path="/teacher/monthly"  element={<RequireAuth><MonthlyViewPage /></RequireAuth>} />
        <Route path="/teacher/payment"  element={<RequireAuth><PaymentPage /></RequireAuth>} />

        {/* 대표/관리자 공통 라우트 */}
        <Route path="/director"            element={<RequireDirector><DirectorDashboard /></RequireDirector>} />
        <Route path="/director/records"    element={<RequireDirector><DirectorRecordsPage /></RequireDirector>} />
        <Route path="/director/accounts"   element={<RequireDirector><AccountsPage /></RequireDirector>} />
        {/* 대표 전용 (결제/건수 입력) */}
        <Route path="/director/payment"    element={<RequireRole role="director"><PaymentPage /></RequireRole>} />
        {/* 구 라우트 호환 */}
        <Route path="/director/daily"      element={<Navigate to="/director/records" replace />} />
        <Route path="/director/monthly"    element={<Navigate to="/director/records" replace />} />

        <Route
          path="*"
          element={
            <Navigate
              to={user ? (user.role === 'director' || user.role === 'admin' ? '/director' : '/teacher') : '/login'}
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
