import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useUnreadInquiryCount } from '@/hooks/queries'

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: React.ReactNode
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 7.5L9 2L16 7.5V16H12V11H6V16H2V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
function CreditCardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 7.5H16" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="10" width="4" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 2V5M12 2V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 7.5H16" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
function ClipboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6H12M6 9H12M6 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1 16c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 7c1.657 0 3 .895 3 2.5M16 16c0-2.209-1.343-4-3-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 3a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H6l-4 3V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

const TEACHER_NAVS: NavItem[] = [
  { to: '/teacher', label: '홈', icon: <HomeIcon />, end: true },
  { to: '/teacher/payment', label: '결제/건수', icon: <CreditCardIcon /> },
  { to: '/teacher/monthly', label: '월별현황', icon: <CalendarIcon /> },
]

const DIRECTOR_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드', icon: <HomeIcon />, end: true },
  { to: '/director/payment', label: '결제/건수', icon: <CreditCardIcon /> },
  { to: '/director/records', label: '건수현황', icon: <ClipboardIcon /> },
  { to: '/director/accounts', label: '직원관리', icon: <UsersIcon /> },
]

const ADMIN_NAVS: NavItem[] = [
  { to: '/director', label: '대시보드', icon: <HomeIcon />, end: true },
  { to: '/director/records', label: '건수현황', icon: <ClipboardIcon /> },
  { to: '/director/accounts', label: '직원관리', icon: <UsersIcon /> },
]

export default function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { data: unreadCount = 0 } = useUnreadInquiryCount(user?.role === 'director' || user?.role === 'admin')

  if (!user) return null

  const navs =
    user.role === 'director' ? DIRECTOR_NAVS :
    user.role === 'admin'    ? ADMIN_NAVS    :
    TEACHER_NAVS

  const roleLabel =
    user.role === 'director' ? '대표' :
    user.role === 'admin'    ? '관리자' :
    user.job_title ?? '선생님'

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-gray-100 z-50">
      {/* 로고 */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="비위더스" className="w-8 h-8 object-contain" />
          <span className="text-[15px] font-bold text-gray-900">비위더스 SRA</span>
        </div>
      </div>

      {/* 내비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navs.map((nav) => (
          <NavLink
            key={nav.to}
            to={nav.to}
            end={nav.end ?? false}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative
               ${isActive
                 ? 'bg-[#e8f7fb] text-[#00b4d8]'
                 : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
            }
          >
            {nav.icon}
            <span>{nav.label}</span>
            {nav.to === '/director/inquiries' && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
             ${isActive ? 'bg-[#e8f7fb] text-[#00b4d8]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
          }
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 12L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>환자 검색</span>
        </NavLink>
        {(user.role === 'director' || user.role === 'admin') && (
          <NavLink
            to="/director/inquiries"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative
               ${isActive ? 'bg-[#e8f7fb] text-[#00b4d8]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`
            }
          >
            <MessageIcon />
            <span>문의함</span>
            {unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </NavLink>
        )}
      </nav>

      {/* 사용자 정보 + 로그아웃 */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#e8f7fb] flex items-center justify-center text-[#00b4d8] text-xs font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{roleLabel}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            title="로그아웃"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
