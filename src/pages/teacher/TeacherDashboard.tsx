import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, formatDate, paymentLabel } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import BottomNav from '@/components/ui/BottomNav'
import RecordEditSheet from '@/components/ui/RecordEditSheet'
import ErrorState from '@/components/ui/ErrorState'
import { useTodayRecords, useMonthSummary, qk } from '@/hooks/queries'
import type { Record as SessionRecord } from '@/types'

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  const [showPinModal, setShowPinModal] = useState(false)
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [editingRecord, setEditingRecord] = useState<SessionRecord | null>(null)

  const today = todayStr()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: todayRecords = [], isLoading: loadingToday, error: errorToday, refetch: refetchToday } =
    useTodayRecords(user?.id ?? null, today)
  const { data: monthSummary = { total: 0, present: 0, absent: 0, makeup: 0, amount: 0 }, isLoading: loadingSummary, error: errorSummary, refetch: refetchSummary } =
    useMonthSummary(user?.id ?? null, monthStart, today)

  const loading = loadingToday || loadingSummary
  const error = errorToday || errorSummary
  const refetch = () => { void refetchToday(); void refetchSummary() }

  const handleRecordSaved = (updated: import('@/types').Record) => {
    if (!user) return
    queryClient.setQueryData(
      qk.todayRecords(user.id, today),
      (old: import('@/types').Record[] | undefined) =>
        (old ?? []).map((r) => r.id === updated.id ? updated : r),
    )
    void queryClient.invalidateQueries({ queryKey: qk.monthSummary(user.id, monthStart) })
  }

  const handleRecordDeleted = (id: string) => {
    if (!user) return
    queryClient.setQueryData(
      qk.todayRecords(user.id, today),
      (old: import('@/types').Record[] | undefined) =>
        (old ?? []).filter((r) => r.id !== id),
    )
    void queryClient.invalidateQueries({ queryKey: qk.monthSummary(user.id, monthStart) })
  }

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
    const { error: updateErr } = await tmp.auth.updateUser({
      password: pinToPassword(pinForm.next),
    })
    setPinLoading(false)
    if (updateErr) {
      setPinError(`변경 실패: ${updateErr.message}`)
      return
    }
    setShowPinModal(false)
    setPinForm({ current: '', next: '', confirm: '' })
    alert('PIN이 변경되었습니다.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <ErrorState onRetry={refetch} />
      </div>
    )
  }

  const statItems = [
    { label: '총건수', value: monthSummary.total, color: 'text-gray-800', bg: 'bg-gray-100' },
    { label: '출석', value: monthSummary.present, color: 'text-[#00b4d8]', bg: 'bg-[#e8f7fb]' },
    { label: '결석', value: monthSummary.absent, color: 'text-[#e85b8a]', bg: 'bg-[#fdeef5]' },
    { label: '보강', value: monthSummary.makeup, color: 'text-[#7db83a]', bg: 'bg-[#f0f9e8]' },
  ]

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-5 md:pt-6">
        <div className="md:max-w-3xl md:mx-auto md:w-full">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-gray-900 text-2xl font-bold">{user?.name} 선생님</h1>
            <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
          </div>
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={() => { setShowPinModal(true); setPinError(''); setPinForm({ current: '', next: '', confirm: '' }) }}
              className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-3 py-1.5 rounded-full active:bg-[#d0eff7] transition-colors"
            >
              PIN 변경
            </button>
            <button
              onClick={async () => { await logout(); navigate('/login') }}
              className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="flex-1 px-4 space-y-3 pb-24 pt-3 md:max-w-3xl md:mx-auto md:w-full">
        {/* 건수 입력 CTA */}
        <button
          onClick={() => navigate('/teacher/payment')}
          className="w-full py-5 bg-[#00b4d8] text-white rounded-2xl text-lg font-bold shadow-md shadow-[#00b4d8]/30 active:bg-[#0096b8] active:scale-[0.99] transition-all"
        >
          + 오늘 건수 입력하기
        </button>

        {/* 이달 요약 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">이달 건수 요약</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {statItems.map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl py-3 text-center`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2.5">
            <span className="text-sm text-slate-500">이달 총 금액</span>
            <span className="text-base font-bold text-slate-900">{formatKRW(monthSummary.amount)}</span>
          </div>
        </div>

        {/* 오늘 입력 내역 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-slate-700">오늘 입력 내역</h2>
            {todayRecords.length > 0 && (
              <span className="text-xs font-semibold text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-0.5 rounded-full">
                {todayRecords.length}건
              </span>
            )}
          </div>

          {todayRecords.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-slate-300 text-sm">오늘 입력된 건수가 없어요</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {todayRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 active:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      r.attendance === 'present' ? 'bg-[#00b4d8]' :
                      r.attendance === 'absent' ? 'bg-[#e85b8a]' : 'bg-[#7db83a]'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{r.patient_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회 · {paymentLabel(r.payment_method, r.payment_note, r.secondary_method, r.tertiary_method, PAYMENT_METHOD_LABELS)}
                        {r.updated_by_name && <span className="text-orange-400"> · 수정: {r.updated_by_name}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                      </p>
                      {r.support_amount > 0 && (
                        <p className="text-xs text-sky-500">지원 {formatKRW(r.support_amount)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingRecord(r)}
                      className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200 transition-colors"
                    >
                      수정
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="h-2" />
        </div>
      </div>

      <BottomNav />

      {/* PIN 변경 모달 */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowPinModal(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[480px] p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-bold text-gray-900">PIN 번호 변경</h2>
              <button onClick={() => setShowPinModal(false)} className="text-gray-400 text-xl px-1">×</button>
            </div>
            {(['current', 'next', 'confirm'] as const).map((key, i) => (
              <input
                key={key}
                type="password"
                inputMode="numeric"
                placeholder={['현재 PIN 4자리', '새 PIN 4자리', '새 PIN 확인'][i]}
                maxLength={4}
                value={pinForm[key]}
                onChange={(e) => { setPinForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, '').slice(0, 4) })); setPinError('') }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00b4d8] tracking-widest text-center text-lg"
              />
            ))}
            {pinError && <p className="text-red-400 text-xs text-center">{pinError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowPinModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-500 text-sm">취소</button>
              <button
                onClick={handlePinChange}
                disabled={pinLoading || pinForm.current.length !== 4 || pinForm.next.length !== 4 || pinForm.confirm.length !== 4}
                className="flex-1 py-3 bg-[#00b4d8] text-white rounded-xl text-sm font-bold disabled:opacity-40 active:bg-[#0096b8] transition-colors"
              >{pinLoading ? '변경 중…' : 'PIN 변경'}</button>
            </div>
          </div>
        </div>
      )}

      {editingRecord && (
        <RecordEditSheet
          record={editingRecord}
          onSave={(updated) => { setEditingRecord(null); handleRecordSaved(updated) }}
          onDelete={(id) => { setEditingRecord(null); handleRecordDeleted(id) }}
          onClose={() => setEditingRecord(null)}
        />
      )}

    </div>
  )
}
