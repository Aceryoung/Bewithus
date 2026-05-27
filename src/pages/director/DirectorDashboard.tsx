import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { formatKRW } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import BottomNav from '@/components/ui/BottomNav'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ErrorState from '@/components/ui/ErrorState'
import { useDirectorDashboard, qk } from '@/hooks/queries'
import type { User, Record as SessionRecord } from '@/types'

interface BranchStats {
  branch: { id: string; name: string }
  teachers: User[]
  totalCount: number
  presentCount: number
  totalAmount: number
  supportAmount: number
  selfPayment: number
  teacherStats: { teacher: User; count: number; amount: number }[]
}

export default function DirectorDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  const [showPinModal, setShowPinModal] = useState(false)
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data, isLoading, error, refetch } = useDirectorDashboard(monthStart, today)

  // 실시간 구독 → 캐시 무효화
  useEffect(() => {
    const sub = supabase
      .channel('director_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => {
        queryClient.invalidateQueries({ queryKey: qk.directorDashboard(monthStart, today) })
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [monthStart, today, queryClient])

  const handlePinChange = async () => {
    if (pinForm.next.length !== 4) { setPinError('새 PIN은 4자리여야 합니다.'); return }
    if (pinForm.next !== pinForm.confirm) { setPinError('새 PIN과 확인 PIN이 다릅니다.'); return }
    if (!user) return
    setPinLoading(true)
    setPinError('')
    const tmp = createTempClient()
    const { error: signInErr } = await tmp.auth.signInWithPassword({
      email: userEmail(user.id),
      password: pinToPassword(pinForm.current),
    })
    if (signInErr) {
      setPinLoading(false)
      setPinError('현재 PIN이 올바르지 않습니다.')
      return
    }
    const { error: updateErr } = await tmp.auth.updateUser({ password: pinToPassword(pinForm.next) })
    setPinLoading(false)
    if (updateErr) { setPinError(`변경 실패: ${updateErr.message}`); return }
    setShowPinModal(false)
    setPinForm({ current: '', next: '', confirm: '' })
    alert('PIN이 변경되었습니다.')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <ErrorState onRetry={refetch} />
      </div>
    )
  }

  const { branches, users, records } = data

  const stats: BranchStats[] = branches.map((branch) => {
    const branchTeachers = users.filter((u) => u.branch_id === branch.id)
    const branchRecords = records.filter((r) => r.branch_id === branch.id)
    const teacherStats = branchTeachers.map((teacher) => {
      const tr = branchRecords.filter((r) => r.teacher_id === teacher.id)
      return { teacher, count: tr.length, amount: tr.reduce((acc, r) => acc + r.total_amount, 0) }
    }).sort((a, b) => b.count - a.count)
    return {
      branch,
      teachers: branchTeachers,
      totalCount: branchRecords.length,
      presentCount: branchRecords.filter((r: SessionRecord) => r.attendance === 'present').length,
      totalAmount: branchRecords.reduce((acc, r) => acc + r.total_amount, 0),
      supportAmount: branchRecords.reduce((acc, r) => acc + r.support_amount, 0),
      selfPayment: branchRecords.reduce((acc, r) => acc + r.self_payment, 0),
      teacherStats,
    }
  })

  const totalCount   = stats.reduce((a, s) => a + s.totalCount, 0)
  const totalAmount  = stats.reduce((a, s) => a + s.totalAmount, 0)
  const totalSelf    = stats.reduce((a, s) => a + s.selfPayment, 0)
  const totalSupport = stats.reduce((a, s) => a + s.supportAmount, 0)

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50 pb-16">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-5 md:pt-6">
        <div className="md:max-w-3xl md:mx-auto md:w-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-gray-900 text-2xl font-bold">{user?.name}</h1>
            <p className="text-gray-400 text-sm mt-1">이달 통합 현황</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 bg-[#f0f9e8] border border-[#7db83a]/30 px-2.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7db83a] animate-pulse" />
              <span className="text-[#7db83a] text-xs font-semibold">실시간</span>
            </div>
            <button
              onClick={() => window.open('/manual.html', '_blank')}
              className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200 transition-colors"
            >
              매뉴얼
            </button>
            {user?.role === 'director' && (
              <button
                onClick={() => { setShowPinModal(true); setPinError(''); setPinForm({ current: '', next: '', confirm: '' }) }}
                className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-3 py-1.5 rounded-full active:bg-[#d0eff7] transition-colors"
              >
                PIN 변경
              </button>
            )}
            <button
              onClick={async () => { await logout(); navigate('/login') }}
              className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '총 건수', value: `${totalCount}건`, highlight: false },
            { label: '자부담 합계', value: formatKRW(totalSelf), highlight: true },
            { label: '총 청구액', value: formatKRW(totalAmount), highlight: false },
            { label: '지원금 합계', value: formatKRW(totalSupport), highlight: false },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl px-4 py-3 ${item.highlight ? 'bg-[#e8f7fb]' : 'bg-gray-50'}`}>
              <p className={`text-base font-bold truncate ${item.highlight ? 'text-[#00b4d8]' : 'text-gray-800'}`}>
                {item.value}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* 지점별 카드 */}
      <div className="px-4 py-4 space-y-3 md:max-w-3xl md:mx-auto md:w-full">
        {stats.map((s) => (
          <div key={s.branch.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{s.branch.name}</h2>
              <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                {s.totalCount}건
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '총 청구액', value: formatKRW(s.totalAmount), highlight: false },
                  { label: '지원금', value: formatKRW(s.supportAmount), highlight: false },
                  { label: '자부담', value: formatKRW(s.selfPayment), highlight: true },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl p-3 text-center ${item.highlight ? 'bg-[#e8f7fb]' : 'bg-gray-50'}`}>
                    <p className={`text-sm font-bold truncate ${item.highlight ? 'text-[#00b4d8]' : 'text-gray-800'}`}>
                      {item.value}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              {s.teacherStats.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">선생님별 건수</p>
                  {s.teacherStats.map(({ teacher, count, amount }) => (
                    <div key={teacher.id} className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">{teacher.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900">{count}건</span>
                        <span className="text-xs text-slate-400 ml-1.5">{formatKRW(amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300 text-center py-2">등록된 선생님이 없습니다.</p>
              )}
            </div>
          </div>
        ))}

        <p className="text-center text-[10px] text-gray-300 pb-2">Made by QuickBizLab</p>
      </div>

      <BottomNav />

      {showPinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-xl">
            <h2 className="text-sm font-bold text-gray-800">PIN 변경</h2>
            {[
              { key: 'current', placeholder: '현재 PIN 4자리' },
              { key: 'next', placeholder: '새 PIN 4자리' },
              { key: 'confirm', placeholder: '새 PIN 확인' },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                type="password"
                inputMode="numeric"
                placeholder={placeholder}
                maxLength={4}
                value={pinForm[key as keyof typeof pinForm]}
                onChange={(e) => setPinForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
              />
            ))}
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowPinModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-500 text-sm">취소</button>
              <button
                onClick={handlePinChange}
                disabled={pinLoading || pinForm.current.length !== 4 || pinForm.next.length !== 4 || pinForm.confirm.length !== 4}
                className="flex-1 py-2 bg-[#00b4d8] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
              >{pinLoading ? '변경 중…' : '변경'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
