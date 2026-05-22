import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

interface NavItem {
  to: string
  label: string
  icon: string
}

const TEACHER_NAVS: NavItem[] = [
  { to: '/teacher', label: '홈', icon: '🏠' },
  { to: '/teacher/input', label: '건수입력', icon: '✏️' },
  { to: '/teacher/monthly', label: '월별건수', icon: '📅' },
  { to: '/teacher/makeup', label: '보강', icon: '🔄' },
]

const DIRECTOR_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드', icon: '📊' },
  { to: '/director/daily', label: '일건수', icon: '📋' },
  { to: '/director/monthly', label: '월건수', icon: '📅' },
  { to: '/director/accounts', label: '계정관리', icon: '👤' },
]

export default function BottomNav() {
  const user = useAuthStore((s) => s.user)
  const navs = user?.role === 'director' ? DIRECTOR_NAVS : TEACHER_NAVS

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-200 flex z-50">
      {navs.map((nav) => (
        <NavLink
          key={nav.to}
          to={nav.to}
          end={nav.to === '/teacher' || nav.to === '/director'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs gap-1 transition-colors
             ${isActive ? 'text-[#00b4d8]' : 'text-gray-400'}`
          }
        >
          <span className="text-xl">{nav.icon}</span>
          <span>{nav.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
