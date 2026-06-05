import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

const ROUTE_TITLES: Record<string, string> = {
  '/teacher': '대시보드',
  '/teacher/payment': '결제 / 건수 입력',
  '/teacher/monthly': '월별 현황',
  '/director': '대시보드',
  '/director/payment': '결제 / 건수 입력',
  '/director/records': '건수 현황',
  '/director/accounts': '직원 관리',
  '/director/inquiries': '문의함',
}

export default function DesktopTopBar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  if (!user) return null

  const title = ROUTE_TITLES[location.pathname] ?? '비위더스 SRA'

  return (
    <header className="hidden lg:flex items-center px-6 h-14 bg-white border-b border-gray-100 sticky top-0 z-30 shrink-0">
      <h1 className="text-sm font-semibold text-gray-900">{title}</h1>
    </header>
  )
}
