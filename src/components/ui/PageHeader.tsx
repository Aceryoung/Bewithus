import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useSearch } from '@/context/SearchContext'

interface Props {
  title: string
  showBack?: boolean
  showLogout?: boolean
  showSearch?: boolean
}

export default function PageHeader({ title, showBack = false, showLogout = false, showSearch = false }: Props) {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const { openSearch } = useSearch()

  return (
    <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="text-[#00b4d8] text-sm font-medium shrink-0"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 text-base font-bold text-gray-900 truncate">{title}</h1>
      {showSearch && user && (
        <button
          onClick={openSearch}
          className="text-gray-400 active:text-[#00b4d8] transition-colors shrink-0 p-1"
          aria-label="환자 검색"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {showLogout && (
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200 transition-colors shrink-0"
        >
          로그아웃
        </button>
      )}
    </header>
  )
}
