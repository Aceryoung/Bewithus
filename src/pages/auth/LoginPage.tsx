import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_SECONDS } from '@/constants'
import type { User } from '@/types'

type Step = 'branch' | 'user' | 'pin'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<Step>('branch')
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [selectedBranch, setSelectedBranch] = useState<{ id: string; name: string } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    // 호점 목록 (branches는 anon 직접 접근 허용)
    supabase.from('branches').select('id, name').then(({ data }) => {
      if (data) setBranches(data)
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

  const handleBranchSelect = async (branchId: string | 'director') => {
    setError('')

    // users 테이블은 anon 직접 접근 불가 → get_active_users() RPC 경유
    const { data: allUsers } = await supabase.rpc('get_active_users')
    if (!allUsers) return

    if (branchId === 'director') {
      const directors = (allUsers as User[]).filter((u) => u.role === 'director')
      setUsers(directors)
      setSelectedBranch({ id: 'director', name: '대표' })
      setStep('user')
    } else {
      const branch = branches.find((b) => b.id === branchId)
      if (!branch) return
      const teachers = (allUsers as User[]).filter(
        (u) => u.role === 'teacher' && u.branch_id === branchId,
      )
      setUsers(teachers)
      setSelectedBranch(branch)
      setStep('user')
    }
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    setPin('')
    setError('')
    setAttempts(0)
    setLockedUntil(null)
    setStep('pin')
  }

  const handlePinInput = (digit: string) => {
    if (lockedUntil) return
    if (pin.length < 4) {
      setPin((p) => p + digit)
    }
  }

  const handlePinDelete = () => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const handlePinSubmit = useCallback(async () => {
    if (pin.length !== 4 || !selectedUser) return
    if (lockedUntil) return

    const { error: loginError } = await login(selectedUser.id, pin)

    if (loginError) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      if (newAttempts >= PIN_MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + PIN_LOCKOUT_SECONDS * 1000)
        setError(`PIN ${PIN_MAX_ATTEMPTS}회 오류. ${PIN_LOCKOUT_SECONDS}초 후 재시도 가능합니다.`)
      } else {
        setError(`PIN이 올바르지 않습니다. (${newAttempts}/${PIN_MAX_ATTEMPTS})`)
      }
    } else {
      navigate(selectedUser.role === 'director' ? '/director' : '/teacher')
    }
  }, [pin, selectedUser, lockedUntil, attempts, login, navigate])

  useEffect(() => {
    if (pin.length === 4) {
      handlePinSubmit()
    }
  }, [pin, handlePinSubmit])

  return (
    <div className="flex flex-col min-h-dvh bg-white">
      {/* 헤더 */}
      <div className="bg-blue-600 text-white px-4 py-6 text-center">
        <h1 className="text-xl font-bold">비위더스 EMR</h1>
        <p className="text-blue-200 text-sm mt-1">예나연 수중운동 클리닉</p>
      </div>

      <div className="flex-1 px-4 py-6">
        {/* Step 1: 호점 선택 */}
        {step === 'branch' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">호점 선택</h2>
            <div className="space-y-3">
              <button
                onClick={() => handleBranchSelect('director')}
                className="w-full py-4 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-semibold text-lg active:bg-blue-100 transition-colors"
              >
                대표
              </button>
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleBranchSelect(b.id)}
                  className="w-full py-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-700 font-semibold text-lg active:bg-gray-100 transition-colors"
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: 이름 선택 */}
        {step === 'user' && (
          <div>
            <button
              onClick={() => setStep('branch')}
              className="flex items-center text-blue-600 mb-4 text-sm"
            >
              ← 호점 선택으로
            </button>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">
              {selectedBranch?.name} — 이름 선택
            </h2>
            <div className="space-y-3">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSelect(u)}
                  className="w-full py-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-700 font-semibold text-lg active:bg-gray-100 transition-colors"
                >
                  {u.name}
                </button>
              ))}
              {users.length === 0 && (
                <p className="text-center text-gray-400 py-8">등록된 선생님이 없습니다.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: PIN 입력 */}
        {step === 'pin' && (
          <div>
            <button
              onClick={() => { setStep('user'); setPin(''); setError('') }}
              className="flex items-center text-blue-600 mb-4 text-sm"
            >
              ← 이름 선택으로
            </button>
            <h2 className="text-lg font-semibold text-gray-800 mb-2 text-center">
              {selectedUser?.name}님, PIN 입력
            </h2>

            {/* PIN 표시 */}
            <div className="flex justify-center gap-4 my-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-full border-2 flex items-center justify-center
                    ${pin.length > i ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                >
                  {pin.length > i && <div className="w-4 h-4 bg-white rounded-full" />}
                </div>
              ))}
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center mb-4">
                {lockedUntil ? `잠금 중 (${countdown}초 후 해제)` : error}
              </p>
            )}

            {/* 숫자 키패드 */}
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  onClick={() => handlePinInput(String(n))}
                  disabled={!!lockedUntil}
                  className="h-16 rounded-xl bg-gray-100 text-gray-800 text-2xl font-medium active:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  {n}
                </button>
              ))}
              <div />
              <button
                onClick={() => handlePinInput('0')}
                disabled={!!lockedUntil}
                className="h-16 rounded-xl bg-gray-100 text-gray-800 text-2xl font-medium active:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                0
              </button>
              <button
                onClick={handlePinDelete}
                className="h-16 rounded-xl bg-gray-100 text-gray-500 text-lg font-medium active:bg-gray-200 transition-colors"
              >
                ←
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
