import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

interface Props {
  title: string
  showBack?: boolean
  showLogout?: boolean
}

export default function PageHeader({ title, showBack = false, showLogout = false }: Props) {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="text-[#00b4d8] text-sm font-medium shrink-0"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 text-base font-bold text-gray-900 truncate">{title}</h1>
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
