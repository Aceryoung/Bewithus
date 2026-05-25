import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import OfflineBanner from '@/components/ui/OfflineBanner'
import ErrorBoundary from '@/components/ui/ErrorBoundary'

const LoginPage         = lazy(() => import('@/pages/auth/LoginPage'))
const TeacherDashboard  = lazy(() => import('@/pages/teacher/TeacherDashboard'))
const MonthlyViewPage   = lazy(() => import('@/pages/teacher/MonthlyViewPage'))
const PaymentPage       = lazy(() => import('@/pages/teacher/PaymentPage'))
const DirectorDashboard = lazy(() => import('@/pages/director/DirectorDashboard'))
const DirectorRecordsPage = lazy(() => import('@/pages/director/DirectorRecordsPage'))
const AccountsPage      = lazy(() => import('@/pages/director/AccountsPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-slate-50">
      <div className="w-8 h-8 rounded-full border-2 border-[#00b4d8] border-t-transparent animate-spin" />
    </div>
  )
}

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

  useEffect(() => {
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
      <OfflineBanner />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/teacher"         element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
          <Route path="/teacher/input"   element={<Navigate to="/teacher/payment" replace />} />
          <Route path="/teacher/monthly" element={<RequireAuth><MonthlyViewPage /></RequireAuth>} />
          <Route path="/teacher/payment" element={<RequireAuth><PaymentPage /></RequireAuth>} />

          {/* 대표/관리자 공통 라우트 */}
          <Route path="/director"          element={<RequireDirector><DirectorDashboard /></RequireDirector>} />
          <Route path="/director/records"  element={<RequireDirector><DirectorRecordsPage /></RequireDirector>} />
          <Route path="/director/accounts" element={<RequireDirector><AccountsPage /></RequireDirector>} />
          {/* 대표 전용 */}
          <Route path="/director/payment"  element={<RequireRole role="director"><PaymentPage /></RequireRole>} />
          {/* 구 라우트 호환 */}
          <Route path="/director/daily"    element={<Navigate to="/director/records" replace />} />
          <Route path="/director/monthly"  element={<Navigate to="/director/records" replace />} />

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
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
