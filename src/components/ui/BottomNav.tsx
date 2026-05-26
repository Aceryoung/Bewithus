import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useUnreadInquiryCount } from '@/hooks/queries'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

const TEACHER_NAVS: NavItem[] = [
  { to: '/teacher', label: '홈', end: true },
  { to: '/teacher/payment', label: '결제/건수' },
  { to: '/teacher/monthly', label: '월별건수' },
]

const DIRECTOR_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드', end: true },
  { to: '/director/payment', label: '결제/건수' },
  { to: '/director/records', label: '건수현황' },
  { to: '/director/accounts', label: '직원관리' },
  { to: '/director/inquiries', label: '문의함' },
]

const ADMIN_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드', end: true },
  { to: '/director/records', label: '건수현황' },
  { to: '/director/accounts', label: '직원관리' },
  { to: '/director/inquiries', label: '문의함' },
]

export default function BottomNav() {
  const user = useAuthStore((s) => s.user)
  const isDirectorOrAdmin = user?.role === 'director' || user?.role === 'admin'
  const { data: unreadCount = 0 } = useUnreadInquiryCount()

  const navs =
    user?.role === 'director' ? DIRECTOR_NAVS :
    user?.role === 'admin'    ? ADMIN_NAVS    :
    TEACHER_NAVS

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-200 flex z-50">
      {navs.map((nav) => (
        <NavLink
          key={nav.to}
          to={nav.to}
          end={nav.end ?? false}
          className={({ isActive }) =>
            `flex-1 flex items-center justify-center py-4 text-sm font-medium transition-colors relative
             ${isActive ? 'text-[#00b4d8]' : 'text-gray-400'}`
          }
        >
          <span className="text-xs font-medium">{nav.label}</span>
          {isDirectorOrAdmin && nav.to === '/director/inquiries' && unreadCount > 0 && (
            <span className="absolute top-2.5 right-1/4 translate-x-full min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
