import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

interface NavItem {
  to: string
  label: string
}

const TEACHER_NAVS: NavItem[] = [
  { to: '/teacher', label: '홈' },
  { to: '/teacher/payment', label: '결제/건수' },
  { to: '/teacher/monthly', label: '월별건수' },
]

const DIRECTOR_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드' },
  { to: '/director/payment', label: '결제/건수' },
  { to: '/director/records', label: '건수현황' },
  { to: '/director/accounts', label: '직원관리' },
]

const ADMIN_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드' },
  { to: '/director/records', label: '건수현황' },
  { to: '/director/accounts', label: '직원관리' },
]

export default function BottomNav() {
  const user = useAuthStore((s) => s.user)
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
          end={nav.to === '/teacher' || nav.to === '/director'}
          className={({ isActive }) =>
            `flex-1 flex items-center justify-center py-4 text-sm font-medium transition-colors
             ${isActive ? 'text-[#00b4d8]' : 'text-gray-400'}`
          }
        >
          <span className="text-xs font-medium">{nav.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
