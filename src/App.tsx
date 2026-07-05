import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import OfflineBanner from '@/components/ui/OfflineBanner'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import Sidebar from '@/components/layout/Sidebar'
import DesktopTopBar from '@/components/layout/DesktopTopBar'
import SearchProvider from '@/context/SearchProvider'

import TeacherDashboard   from '@/pages/teacher/TeacherDashboard'
import MonthlyViewPage    from '@/pages/teacher/MonthlyViewPage'
import PaymentPage        from '@/pages/teacher/PaymentPage'
import DirectorDashboard  from '@/pages/director/DirectorDashboard'
import DirectorRecordsPage from '@/pages/director/DirectorRecordsPage'
import AccountsPage       from '@/pages/director/AccountsPage'
import InquiryPage        from '@/pages/director/InquiryPage'
import PatientSearchPage  from '@/pages/search/PatientSearchPage'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))

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
  const queryClient = useQueryClient()

  useEffect(() => {
    restoreSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ user: null })
        queryClient.removeQueries({ queryKey: ['patientSearch'] })
      } else if (event === 'TOKEN_REFRESHED') {
        // SIGNED_IN은 제외 — 활성 로그인 플로우(finishLogin)가 직접 처리함
        // SIGNED_IN 시 restoreSession 호출하면 LoginPage 리마운트 race condition 발생
        void restoreSession()
      }
    })

    return () => subscription.unsubscribe()
  }, [restoreSession, queryClient])

  return (
    <BrowserRouter>
      <SearchProvider>
      <OfflineBanner />
      <Sidebar />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <DesktopTopBar />
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

          {/* 공통 라우트 */}
          <Route path="/search" element={<RequireAuth><PatientSearchPage /></RequireAuth>} />

          {/* 선생님 라우트 */}
          <Route path="/teacher"         element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
          <Route path="/teacher/input"   element={<Navigate to="/teacher/payment" replace />} />
          <Route path="/teacher/monthly" element={<RequireAuth><MonthlyViewPage /></RequireAuth>} />
          <Route path="/teacher/payment" element={<RequireAuth><PaymentPage /></RequireAuth>} />

          {/* 대표/관리자 공통 라우트 */}
          <Route path="/director"          element={<RequireDirector><DirectorDashboard /></RequireDirector>} />
          <Route path="/director/records"  element={<RequireDirector><DirectorRecordsPage /></RequireDirector>} />
          <Route path="/director/accounts"   element={<RequireDirector><AccountsPage /></RequireDirector>} />
          <Route path="/director/inquiries" element={<RequireDirector><InquiryPage /></RequireDirector>} />
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
      </SearchProvider>
    </BrowserRouter>
  )
}
