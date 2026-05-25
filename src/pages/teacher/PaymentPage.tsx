import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS } from '@/constants'
import { uploadReceipt } from '@/lib/storage'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import RecordFormFields from '@/components/ui/RecordFormFields'
import SavedToast from '@/components/ui/SavedToast'
import { useFeeTables, useMonthlyUsed } from '@/hooks/queries'
import type { Attendance, PaymentMethod } from '@/types'

type ActiveTab = 'count' | 'payment'

/* ── 건수 전용 행 ── */
interface CountRow {
  id: string
  patient_name: string
  attendance: Attendance
  session_count: number
}

function newCountRow(): CountRow {
  return { id: crypto.randomUUID(), patient_name: '', attendance: 'present', session_count: 1 }
}

/* ── 결제 전용 행 ── */
interface PayRow {
  id: string
  patient_name: string
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  after_school_support?: number
  sports_voucher_support?: number
  secondary_method?: PaymentMethod
  secondary_override?: number
  support_amount: number
  secondary_support: number
  remaining_support: number
  self_payment: number
  total_amount: number
  payment_note?: string
  receiptFile?: File
}

function newPayRow(): PayRow {
  return {
    id: crypto.randomUUID(),
    patient_name: '',
    fee_type: '',
    unit_price: 0,
    session_count: 1,
    payment_method: 'card',
    support_amount: 0,
    secondary_support: 0,
    remaining_support: 0,
    self_payment: 0,
    total_amount: 0,
  }
}

function recalcPayRows(
  rows: PayRow[],
  monthlyUsed: Record<string, Record<PaymentMethod, number>>,
): PayRow[] {
  const inFormAccum: Record<string, Partial<Record<PaymentMethod, number>>> = {}
  return rows.map((row) => {
    const name = row.patient_name.trim()
    if (name && !inFormAccum[name]) inFormAccum[name] = {}

    const total = row.unit_price * row.session_count

    const primaryOverride =
      row.payment_method === 'after_school' ? row.after_school_support :
      row.payment_method === 'sports_voucher' ? row.sports_voucher_support :
      undefined
    const primaryDbUsed   = name ? (monthlyUsed[name]?.[row.payment_method] ?? 0) : 0
    const primaryFormUsed = name ? (inFormAccum[name]?.[row.payment_method] ?? 0) : 0

    // 주 결제방식: 독립 용량 (full total 기준)
    const primaryCapacity = calcSupport(total, row.payment_method, primaryDbUsed + primaryFormUsed, primaryOverride).support

    // 보조 결제방식: 독립 용량 계산 후 cascade로 실제 사용량 결정
    let secondaryCapacity = 0
    let secondarySupport = 0
    if (row.secondary_method) {
      const secOverride =
        (row.secondary_method === 'after_school' || row.secondary_method === 'sports_voucher')
          ? row.secondary_override : undefined
      const secDbUsed   = name ? (monthlyUsed[name]?.[row.secondary_method] ?? 0) : 0
      const secFormUsed = name ? (inFormAccum[name]?.[row.secondary_method] ?? 0) : 0
      secondaryCapacity = calcSupport(total, row.secondary_method, secDbUsed + secFormUsed, secOverride).support
      // cascade: 주 결제 이후 남은 금액에서만 사용
      secondarySupport = Math.min(secondaryCapacity, Math.max(0, total - primaryCapacity))
    }

    const totalSupportUsed = primaryCapacity + secondarySupport
    const finalSelf = Math.max(0, total - totalSupportUsed)
    // 두 방식의 독립 용량 합이 결제금액 초과 → 남은지원금 자동 계산
    const autoRemaining = Math.max(0, primaryCapacity + secondaryCapacity - total)

    if (name) {
      inFormAccum[name][row.payment_method] = (inFormAccum[name][row.payment_method] ?? 0) + primaryCapacity
      if (row.secondary_method) {
        inFormAccum[name][row.secondary_method] = (inFormAccum[name][row.secondary_method] ?? 0) + secondarySupport
      }
    }

    return {
      ...row,
      total_amount: total,
      support_amount: totalSupportUsed,   // DB: 총 지원금 (기존 코드 호환)
      secondary_support: secondarySupport, // DB: 보조 지원금 (내역용)
      remaining_support: autoRemaining,    // DB: 자동 계산된 남은지원금
      self_payment: finalSelf,
    }
  })
}

export default function PaymentPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<ActiveTab>('count')
  const [date, setDate] = useState(todayStr())

  /* 건수 탭 상태 */
  const [countRows, setCountRows] = useState<CountRow[]>([newCountRow()])
  const [savingCount, setSavingCount] = useState(false)
  const [savedCountN, setSavedCountN] = useState(0)

  /* 결제 탭 상태 */
  const [payRows, setPayRows] = useState<PayRow[]>([newPayRow()])
  const [savingPay, setSavingPay] = useState(false)
  const [savedPayN, setSavedPayN] = useState(0)

  const { data: feeTables = [] } = useFeeTables(user?.branch_id ?? null)
  const { data: monthlyUsed = {} } = useMonthlyUsed(user?.id ?? null, date)

  useEffect(() => {
    setPayRows((prev) => recalcPayRows(prev, monthlyUsed))
  }, [monthlyUsed])

  const updatePayRow = (id: string, updates: Partial<PayRow>) => {
    setPayRows((prev) => {
      const patched = prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      return recalcPayRows(patched, monthlyUsed)
    })
  }

  /* ── 건수 저장 ── */
  const handleSaveCount = async () => {
    if (!user) return
    if (!user.branch_id) { alert('호점이 배정되지 않은 계정입니다. 대표에게 문의하세요.'); return }
    const valid = countRows.filter((r) => r.patient_name.trim())
    if (valid.length === 0) return
    setSavingCount(true)
    const { error } = await supabase.from('records').insert(
      valid.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        patient_name: r.patient_name.trim(),
        attendance: r.attendance,
        fee_type: '금액없음',
        session_count: r.session_count,
        unit_price: 0,
        total_amount: 0,
        payment_method: 'card',
        support_amount: 0,
        secondary_support: 0,
        remaining_support: 0,
        self_payment: 0,
      })),
    )
    setSavingCount(false)
    if (error) { alert(`저장 실패: ${error.message}`); return }
    setSavedCountN(valid.length)
    setCountRows([newCountRow()])
    setTimeout(() => setSavedCountN(0), 3000)
    void queryClient.invalidateQueries({ queryKey: ['records', 'today', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthSummary', user.id] })
  }

  /* ── 결제 저장 ── */
  const handleSavePay = async () => {
    if (!user) return
    if (!user.branch_id) { alert('호점이 배정되지 않은 계정입니다. 대표에게 문의하세요.'); return }
    const valid = payRows.filter((r) => r.patient_name.trim())
    if (valid.length === 0) return
    setSavingPay(true)
    const { data: inserted, error } = await supabase.from('records').insert(
      valid.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        patient_name: r.patient_name.trim(),
        attendance: 'present',
        fee_type: r.fee_type || '직접입력',
        session_count: r.session_count,
        unit_price: r.unit_price,
        total_amount: r.total_amount,
        payment_method: r.payment_method,
        payment_note: r.payment_note || null,
        support_amount: r.support_amount,
        secondary_method: r.secondary_method || null,
        secondary_support: r.secondary_support,
        remaining_support: r.remaining_support,
        self_payment: r.self_payment,
      })),
    ).select('id')
    setSavingPay(false)
    if (error || !inserted) { alert(`저장 실패: ${error?.message ?? '알 수 없는 오류'}`); return }
    for (let i = 0; i < inserted.length; i++) {
      const file = valid[i].receiptFile
      if (!file) continue
      const url = await uploadReceipt(file, user.id, inserted[i].id)
      if (url) await supabase.from('records').update({ receipt_url: url }).eq('id', inserted[i].id)
    }
    setSavedPayN(valid.length)
    setPayRows([newPayRow()])
    setTimeout(() => setSavedPayN(0), 3000)
    void queryClient.invalidateQueries({ queryKey: ['records', 'today', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthSummary', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['monthlyUsed', user.id] })
  }

  const totalSelf    = payRows.reduce((acc, r) => acc + r.self_payment, 0)
  const totalSupport = payRows.reduce((acc, r) => acc + r.support_amount, 0)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <SavedToast count={savedCountN || savedPayN} />
      <PageHeader title="결제 / 건수" showBack />

      {/* 탭 */}
      <div className="flex bg-white border-b border-gray-100 px-4 pt-2">
        {(['count', 'payment'] as ActiveTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2
              ${tab === t ? 'text-[#00b4d8] border-[#00b4d8]' : 'text-gray-400 border-transparent'}`}
          >
            {t === 'count' ? '건수 입력' : '결제 입력'}
          </button>
        ))}
      </div>

      {/* 날짜 공통 */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-500 shrink-0">날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 text-sm font-medium text-gray-900 outline-none bg-transparent"
          />
        </div>
      </div>

      {/* ── 건수 탭 ── */}
      {tab === 'count' && (
        <div className="flex-1 px-4 py-4 space-y-4 pb-40">
          {countRows.map((row, idx) => (
            <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
                {countRows.length > 1 && (
                  <button
                    onClick={() => setCountRows((prev) => prev.filter((r) => r.id !== row.id))}
                    className="text-red-400 text-xs"
                  >
                    삭제
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="환자명 입력"
                value={row.patient_name}
                onChange={(e) =>
                  setCountRows((prev) =>
                    prev.map((r) => r.id === row.id ? { ...r, patient_name: e.target.value.replace(/[0-9]/g, '') } : r)
                  )
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              />

              {/* 출결 */}
              <div className="flex gap-2">
                {(['present', 'absent', 'makeup'] as Attendance[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, attendance: a } : r))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                      ${row.attendance === a
                        ? a === 'absent' ? 'bg-[#e85b8a] text-white'
                        : a === 'makeup' ? 'bg-[#7db83a] text-white'
                        : 'bg-[#00b4d8] text-white'
                        : 'bg-gray-100 text-gray-500'}`}
                  >
                    {ATTENDANCE_LABELS[a]}
                  </button>
                ))}
              </div>

              {/* 횟수 직접입력 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">횟수</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="횟수 입력"
                  value={row.session_count || ''}
                  onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
                  onChange={(e) => {
                    const n = Math.max(1, Math.round(Number(e.target.value) || 1))
                    setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, session_count: n } : r))
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
                />
              </div>
            </div>
          ))}

          <button
            onClick={() => setCountRows((prev) => [...prev, newCountRow()])}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm font-medium active:bg-gray-50 transition-colors"
          >
            + 환자 추가
          </button>
        </div>
      )}

      {/* ── 결제 탭 ── */}
      {tab === 'payment' && (
        <div className="flex-1 px-4 py-4 space-y-4 pb-52">
          {payRows.map((row, idx) => (
            <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
                {payRows.length > 1 && (
                  <button
                    onClick={() =>
                      setPayRows((prev) => recalcPayRows(prev.filter((r) => r.id !== row.id), monthlyUsed))
                    }
                    className="text-red-400 text-xs"
                  >
                    삭제
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="환자명 입력"
                value={row.patient_name}
                onChange={(e) => updatePayRow(row.id, { patient_name: e.target.value.replace(/[0-9]/g, '') })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
              />

              <RecordFormFields
                state={{
                  fee_type: row.fee_type,
                  unit_price: row.unit_price,
                  session_count: row.session_count,
                  payment_method: row.payment_method,
                  after_school_support: row.after_school_support,
                  sports_voucher_support: row.sports_voucher_support,
                  secondary_method: row.secondary_method,
                  secondary_override: row.secondary_override,
                  payment_note: row.payment_note,
                }}
                feeTables={feeTables}
                total={row.total_amount}
                support={row.support_amount}
                secondarySupport={row.secondary_support}
                remainingSupport={row.remaining_support}
                selfPayment={row.self_payment}
                onChange={(updates) => updatePayRow(row.id, updates)}
              />

              {/* 영수증 첨부 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">영수증 사진 <span className="text-gray-300">(선택)</span></p>
                {row.receiptFile ? (
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(row.receiptFile)}
                      alt="영수증"
                      className="w-full rounded-xl object-cover max-h-44"
                    />
                    <button
                      onClick={() => updatePayRow(row.id, { receiptFile: undefined })}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-sm leading-none"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm cursor-pointer active:bg-gray-50 transition-colors">
                    <span>사진 첨부</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) updatePayRow(row.id, { receiptFile: file })
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={() => setPayRows((prev) => [...prev, newPayRow()])}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm font-medium active:bg-gray-50 transition-colors"
          >
            + 환자 추가
          </button>
        </div>
      )}

      <BottomNav />

      {/* 저장 버튼 고정 */}
      {tab === 'count' && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-3 pt-2 bg-white border-t border-gray-100 shadow-lg">
          <button
            onClick={handleSaveCount}
            disabled={savingCount || countRows.every((r) => !r.patient_name.trim())}
            className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-base active:bg-[#0096b8] disabled:opacity-40 transition-colors"
          >
            {savingCount ? '저장 중...' : '건수 저장하기'}
          </button>
        </div>
      )}

      {tab === 'payment' && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-3 pt-2 bg-white border-t border-gray-100 shadow-lg">
          <div className="flex justify-between text-sm text-gray-500 py-2">
            <span>자부담 합계</span>
            <span className="font-bold text-gray-900">{formatKRW(totalSelf)}</span>
          </div>
          {totalSupport > 0 && (
            <div className="flex justify-between text-sm text-[#00b4d8] pb-2">
              <span>지원금 합계</span>
              <span>{formatKRW(totalSupport)}</span>
            </div>
          )}
          <button
            onClick={handleSavePay}
            disabled={savingPay || payRows.every((r) => !r.patient_name.trim())}
            className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-base active:bg-[#0096b8] disabled:opacity-40 transition-colors"
          >
            {savingPay ? '저장 중...' : '결제 저장하기'}
          </button>
        </div>
      )}
    </div>
  )
}
