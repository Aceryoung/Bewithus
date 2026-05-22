import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_SECONDS } from '@/constants'
import type { User } from '@/types'
import logo from '@/assets/logo.png'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [users, setUsers] = useState<User[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.rpc('get_active_users'),
      supabase.from('branches').select('id, name'),
    ]).then(([usersRes, branchRes]) => {
      if (usersRes.data) setUsers(usersRes.data as User[])
      if (branchRes.data) setBranches(branchRes.data)
    })
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setAttempts(0)
        setCountdown(0)
        clearInterval(interval)
      } else {
        setCountdown(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const handleUserSelect = (user: User) => {
    if (loginLoading) return
    setSelectedUser(user)
    setPin('')
    setError('')
    setAttempts(0)
    setLockedUntil(null)
  }

  const handlePinInput = (digit: string) => {
    if (lockedUntil || loginLoading || !selectedUser) return
    if (pin.length < 4) setPin((p) => p + digit)
  }

  const handlePinDelete = () => {
    if (loginLoading) return
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const handlePinSubmit = useCallback(async () => {
    if (pin.length !== 4 || !selectedUser || loginLoading || lockedUntil) return
    setLoginLoading(true)
    const { error: loginError } = await login(selectedUser.id, pin)
    setLoginLoading(false)
    if (loginError) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      if (newAttempts >= PIN_MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + PIN_LOCKOUT_SECONDS * 1000)
        setError(`${PIN_MAX_ATTEMPTS}회 오류. ${PIN_LOCKOUT_SECONDS}초 후 재시도 가능합니다.`)
      } else {
        setError(`PIN이 올바르지 않습니다. (${newAttempts}/${PIN_MAX_ATTEMPTS})`)
      }
    } else {
      navigate(selectedUser.role === 'director' ? '/director' : '/teacher')
    }
  }, [pin, selectedUser, lockedUntil, attempts, login, navigate, loginLoading])

  useEffect(() => {
    if (pin.length === 4) handlePinSubmit()
  }, [pin, handlePinSubmit])

  const directors = users.filter((u) => u.role === 'director')
  const teachers  = users.filter((u) => {
    if (u.role !== 'teacher') return false
    if (branchFilter !== 'all' && u.branch_id !== branchFilter) return false
    if (search.trim() && !u.name.includes(search.trim())) return false
    return true
  })
  const pinReady = !!selectedUser && !lockedUntil

  const BRANCH_SUBTITLES: Record<string, string> = {
    '1호점': '비위더스 재활운동센터',
    '2호점': '비위더스 운동발달연구소',
  }
  const subtitle = (() => {
    if (!selectedUser) return '비위더스'
    if (selectedUser.role === 'director') return '비위더스'
    const branch = branches.find((b) => b.id === selectedUser.branch_id)
    return branch ? (BRANCH_SUBTITLES[branch.name] ?? '비위더스') : '비위더스'
  })()

  const UserBtn = ({ u }: { u: User }) => (
    <button
      onClick={() => handleUserSelect(u)}
      className={`w-full py-3 px-3 rounded-2xl text-left transition-all duration-150 active:scale-[0.98] ${
        selectedUser?.id === u.id
          ? 'bg-[#e8f7fb] border-2 border-[#00b4d8] text-[#007a93]'
          : 'bg-gray-50 border-2 border-transparent text-gray-700 active:bg-gray-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm truncate">{u.name}</p>
        {selectedUser?.id === u.id && (
          <div className="w-4 h-4 rounded-full bg-[#00b4d8] flex items-center justify-center shrink-0 ml-1">
            <svg width="8" height="7" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
    </button>
  )

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      {/* 브랜드 */}
      <div className="flex flex-col items-center pt-10 pb-4 px-6">
        <img src={logo} alt="비위더스 로고" className="w-20 h-20 object-contain mb-2" />
        <p className="text-gray-500 text-sm font-semibold transition-all duration-300">{subtitle}</p>
      </div>

      <div className="flex-1 px-4 pb-8 flex flex-col gap-3 overflow-y-auto">

        {/* 이름 선택 카드 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">이름 선택</p>

          {users.length === 0 ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[#00b4d8] border-t-transparent animate-spin" />
              <span className="text-gray-400 text-sm">불러오는 중...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 대표 */}
              {directors.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSelect(u)}
                  className={`w-full py-3.5 px-4 rounded-2xl text-left transition-all duration-150 active:scale-[0.98] ${
                    selectedUser?.id === u.id
                      ? 'bg-[#e8f7fb] border-2 border-[#00b4d8] text-[#007a93]'
                      : 'bg-gray-50 border-2 border-transparent text-gray-700 active:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">{u.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">대표</p>
                    </div>
                    {selectedUser?.id === u.id && (
                      <div className="w-5 h-5 rounded-full bg-[#00b4d8] flex items-center justify-center">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {/* 구분선 */}
              {directors.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[11px] text-gray-300 font-medium">선생님</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}

              {/* 지점 탭 필터 */}
              {branches.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBranchFilter('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      branchFilter === 'all' ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >전체</button>
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBranchFilter(b.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        branchFilter === b.id ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >{b.name}</button>
                  ))}
                </div>
              )}

              {/* 검색 (선생님 5명 이상일 때만) */}
              {users.filter(u => u.role === 'teacher').length >= 5 && (
                <input
                  type="text"
                  placeholder="이름 검색..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
                />
              )}

              {/* 선생님 2열 그리드 */}
              <div className="grid grid-cols-2 gap-2">
                {teachers.map((u) => <UserBtn key={u.id} u={u} />)}
                {teachers.length === 0 && (
                  <p className="col-span-2 text-center text-gray-300 text-sm py-4">
                    {search ? '검색 결과가 없습니다' : '등록된 선생님이 없습니다'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PIN 카드 */}
        <div className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-5 transition-opacity duration-300 ${selectedUser ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">PIN 번호</p>

          {/* PIN 도트 */}
          <div className="flex justify-center gap-4 mb-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ width: 52, height: 52 }}
                className={`rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
                  loginLoading ? 'bg-[#e8f7fb] border-[#00b4d8]/40'
                    : pin.length > i ? 'bg-[#00b4d8] border-[#00b4d8] shadow-md scale-110'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {pin.length > i && !loginLoading && <div className="w-3.5 h-3.5 bg-white rounded-full" />}
                {loginLoading && i < pin.length && <div className="w-3 h-3 rounded-full bg-[#00b4d8] animate-pulse" />}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center mb-3 font-medium">
              {lockedUntil ? `🔒 잠금 중 (${countdown}초 후 해제)` : error}
            </p>
          )}

          {/* 키패드 */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => handlePinInput(String(n))}
                disabled={!pinReady || loginLoading}
                className="h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 text-xl font-semibold active:bg-[#e8f7fb] active:border-[#00b4d8] active:scale-95 disabled:opacity-30 transition-all duration-100"
              >{n}</button>
            ))}
            <div />
            <button
              onClick={() => handlePinInput('0')}
              disabled={!pinReady || loginLoading}
              className="h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-800 text-xl font-semibold active:bg-[#e8f7fb] active:border-[#00b4d8] active:scale-95 disabled:opacity-30 transition-all duration-100"
            >0</button>
            <button
              onClick={handlePinDelete}
              disabled={loginLoading}
              className="h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400 text-lg active:bg-gray-100 active:scale-95 disabled:opacity-30 transition-all duration-100"
            >⌫</button>
          </div>
        </div>
      </div>
    </div>
  )
}
