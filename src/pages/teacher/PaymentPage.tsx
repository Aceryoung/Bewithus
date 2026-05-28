import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS, BRANCH_VOUCHER_CONFIG, MONTHLY_SUPPORT_LIMITS, PAYMENT_METHOD_LABELS } from '@/constants'
import { uploadReceipt } from '@/lib/storage'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import RecordFormFields from '@/components/ui/RecordFormFields'
import SavedToast from '@/components/ui/SavedToast'
import ErrorModal from '@/components/ui/ErrorModal'
import PatientInput from '@/components/ui/PatientInput'
import { isAppError } from '@/lib/appErrors'
import { saveDraft, loadDraft, clearDraft } from '@/lib/draft'
import { useFeeTables, useMonthlyUsed, useRecentPatients, useBranchVoucherConfig } from '@/hooks/queries'
import type { Attendance, PaymentMethod } from '@/types'
import type { AppErrorCode } from '@/lib/appErrors'

type ActiveTab = 'count' | 'payment'

/* ── 건수 전용 행 ── */
interface CountRow {
  id: string
  patient_name: string
  attendance: Attendance
  session_count: number
  birth_year?: string
  billing_month?: string
  _countDisplay?: string
}

function newCountRow(): CountRow {
  return { id: crypto.randomUUID(), patient_name: '', attendance: 'present', session_count: 1 }
}

/* ── 결제 전용 행 ── */
interface PayRow {
  id: string
  patient_name: string
  birth_year?: string
  attendance: Attendance
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  secondary_methods: PaymentMethod[]
  secondary_overrides: Partial<Record<PaymentMethod, number>>
  voucherSupports: Partial<Record<PaymentMethod, number>>
  support_amount: number
  secondary_support: number
  tertiary_support: number
  remaining_support: number
  self_payment: number
  total_amount: number
  payment_note?: string
  billing_month?: string
  receiptFile?: File
}

function newPayRow(): PayRow {
  return {
    id: crypto.randomUUID(),
    patient_name: '',
    attendance: 'payment',
    fee_type: '',
    unit_price: 0,
    session_count: 1,
    payment_method: 'card',
    secondary_methods: [],
    secondary_overrides: {},
    voucherSupports: {},
    support_amount: 0,
    secondary_support: 0,
    tertiary_support: 0,
    remaining_support: 0,
    self_payment: 0,
    total_amount: 0,
  }
}

function recalcPayRows(
  rows: PayRow[],
  monthlyUsed: Record<string, Record<PaymentMethod, number>>,
  branchLimits?: Partial<Record<PaymentMethod, number>>,
): PayRow[] {
  const inFormAccum: Record<string, Partial<Record<PaymentMethod, number>>> = {}
  return rows.map((row) => {
    const name = row.patient_name.trim()
    if (name && !inFormAccum[name]) inFormAccum[name] = {}

    const total = row.unit_price * row.session_count

    // 각 바우처의 독립 용량 계산
    const capacities: Partial<Record<PaymentMethod, number>> = {}
    for (const method of row.secondary_methods) {
      const override = row.secondary_overrides[method]
      const dbUsed = name ? (monthlyUsed[name]?.[method] ?? 0) : 0
      const formUsed = name ? (inFormAccum[name]?.[method] ?? 0) : 0
      capacities[method] = calcSupport(total, method, dbUsed + formUsed, override, branchLimits).support
    }

    // cascade: 각 바우처가 순서대로 남은 금액 충당
    const actualSupports: Partial<Record<PaymentMethod, number>> = {}
    let remaining = total
    for (const method of row.secondary_methods) {
      const capacity = capacities[method] ?? 0
      const actual = Math.min(capacity, remaining)
      actualSupports[method] = actual
      remaining -= actual
    }

    const totalSupportUsed = Object.values(actualSupports).reduce((a, b) => a + (b ?? 0), 0)
    const totalCapacity = Object.values(capacities).reduce((a, b) => a + (b ?? 0), 0)
    const autoRemaining = Math.max(0, totalCapacity - total)

    // 동일 환자 이후 행을 위한 누적
    if (name) {
      for (const method of row.secondary_methods) {
        inFormAccum[name][method] = (inFormAccum[name][method] ?? 0) + (actualSupports[method] ?? 0)
      }
    }

    return {
      ...row,
      total_amount: total,
      voucherSupports: actualSupports,
      support_amount: totalSupportUsed,
      secondary_support: actualSupports[row.secondary_methods[0]] ?? 0,
      tertiary_support: actualSupports[row.secondary_methods[1]] ?? 0,
      remaining_support: autoRemaining,
      self_payment: Math.max(0, total - totalSupportUsed),
    }
  })
}

export default function PaymentPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<ActiveTab>('count')
  const [date, setDate] = useState(todayStr())

  /* 건수 탭 상태 */
  const [countRows, setCountRows] = useState<CountRow[]>(() => {
    if (!user) return [newCountRow()]
    const draft = loadDraft<CountRow[]>(user.id, 'countRows')
    return draft ? draft.data : [newCountRow()]
  })
  const [savingCount, setSavingCount] = useState(false)
  const [savedCountN, setSavedCountN] = useState(0)

  /* 결제 탭 상태 */
  const [payRows, setPayRows] = useState<PayRow[]>(() => {
    if (!user) return [newPayRow()]
    const draft = loadDraft<PayRow[]>(user.id, 'payRows')
    return draft ? draft.data : [newPayRow()]
  })
  const [savingPay, setSavingPay] = useState(false)
  const [savedPayN, setSavedPayN] = useState(0)
  const [errorModal, setErrorModal] = useState<{ code: AppErrorCode; detail?: string } | null>(null)
  const [dupWarning, setDupWarning] = useState<string[]>([])

  const { data: feeTables = [] } = useFeeTables(user?.branch_id ?? null)
  const { data: monthlyUsed = {} } = useMonthlyUsed(user?.id ?? null, date)
  const { data: recentPatients = [] } = useRecentPatients(user?.id ?? null)
  const { data: voucherConfig } = useBranchVoucherConfig(user?.branch_id ?? null)

  const branchLimits = useMemo(() => {
    if (voucherConfig && voucherConfig.length > 0) {
      return voucherConfig.reduce<Partial<Record<PaymentMethod, number>>>(
        (acc, c) => c.monthly_limit > 0 ? { ...acc, [c.payment_method]: c.monthly_limit } : acc,
        {},
      )
    }
    return user?.branch_name ? BRANCH_VOUCHER_CONFIG[user.branch_name]?.limits : undefined
  }, [voucherConfig, user?.branch_name])

  const countDupNames = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const row of countRows) {
      const name = row.patient_name.trim()
      if (name) counts[name] = (counts[name] ?? 0) + 1
    }
    return new Set(Object.keys(counts).filter((n) => counts[n] > 1))
  }, [countRows])

  const payDupNames = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const row of payRows) {
      const name = row.patient_name.trim()
      if (name) counts[name] = (counts[name] ?? 0) + 1
    }
    return new Set(Object.keys(counts).filter((n) => counts[n] > 1))
  }, [payRows])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayRows((prev) => recalcPayRows(prev, monthlyUsed, branchLimits))
  }, [monthlyUsed, branchLimits])

  /* ── 임시저장 (변경될 때마다) ── */
  useEffect(() => {
    if (!user) return
    saveDraft(user.id, 'countRows', countRows)
  }, [countRows, user])

  useEffect(() => {
    if (!user) return
    saveDraft(user.id, 'payRows', payRows)
  }, [payRows, user])

  const updatePayRow = (id: string, updates: Partial<PayRow>) => {
    setPayRows((prev) => {
      const patched = prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      return recalcPayRows(patched, monthlyUsed, branchLimits)
    })
  }

  /* ── 건수 저장 ── */
  const handleSaveCount = async (force = false) => {
    if (!user) return
    if (!user.branch_id) { setErrorModal({ code: 'ERR-401' }); return }
    const valid = countRows.filter((r) => r.patient_name.trim())
    if (valid.length === 0) return

    /* ── 중복 체크 ── */
    if (!force) {
      const { data: existing } = await supabase
        .from('records').select('patient_name').eq('teacher_id', user.id).eq('date', date)
      const existingNames = new Set((existing ?? []).map((r) => r.patient_name))
      const dups = valid.map((r) => r.patient_name.trim()).filter((n) => existingNames.has(n))
      if (dups.length > 0) {
        setDupWarning(dups)
        return
      }
    }

    setSavingCount(true)
    const { error } = await supabase.from('records').insert(
      valid.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        billing_month: r.billing_month ?? date.slice(0, 7),
        patient_name: r.patient_name.trim(),
        birth_year: r.birth_year?.trim() || null,
        attendance: r.attendance,
        fee_type: '금액없음',
        session_count: r.session_count,
        unit_price: 0,
        total_amount: 0,
        payment_method: 'card',
        support_amount: 0,
        secondary_support: 0,
        tertiary_support: 0,
        remaining_support: 0,
        self_payment: 0,
      })),
    )
    setSavingCount(false)
    if (error) { setErrorModal({ code: 'ERR-101', detail: error.message }); return }
    clearDraft(user.id, 'countRows')
    setSavedCountN(valid.length)
    setCountRows([newCountRow()])
    setTimeout(() => setSavedCountN(0), 3000)
    void queryClient.invalidateQueries({ queryKey: ['records', 'today', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthSummary', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthly', user.id] })
  }

  /* ── 결제 저장 ── */
  const handleSavePay = async (force = false) => {
    if (!user) return
    if (!user.branch_id) { setErrorModal({ code: 'ERR-401' }); return }
    const valid = payRows.filter((r) => r.patient_name.trim())
    if (valid.length === 0) return

    /* ── 중복 체크 ── */
    if (!force) {
      const { data: existing2 } = await supabase
        .from('records').select('patient_name').eq('teacher_id', user.id).eq('date', date)
      const existingNames2 = new Set((existing2 ?? []).map((r) => r.patient_name))
      const dups2 = valid.map((r) => r.patient_name.trim()).filter((n) => existingNames2.has(n))
      if (dups2.length > 0) {
        setDupWarning(dups2)
        return
      }
    }

    setSavingPay(true)
    const { data: inserted, error } = await supabase.from('records').insert(
      valid.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        billing_month: r.billing_month ?? date.slice(0, 7),
        patient_name: r.patient_name.trim(),
        birth_year: r.birth_year?.trim() || null,
        attendance: 'payment' as const,
        fee_type: r.fee_type || '직접입력',
        session_count: r.session_count,
        unit_price: r.unit_price,
        total_amount: r.total_amount,
        payment_method: r.payment_method,
        payment_note: r.payment_note || null,
        support_amount: r.support_amount,
        secondary_method: r.secondary_methods[0] ?? null,
        secondary_support: r.secondary_support,
        tertiary_method: r.secondary_methods[1] ?? null,
        tertiary_support: r.tertiary_support,
        remaining_support: r.remaining_support,
        self_payment: r.self_payment,
      })),
    ).select('id')
    setSavingPay(false)
    if (error || !inserted) { setErrorModal({ code: 'ERR-101', detail: error?.message }); return }
    for (let i = 0; i < inserted.length; i++) {
      const file = valid[i].receiptFile
      if (!file) continue
      try {
        const url = await uploadReceipt(file, user.id, inserted[i].id)
        if (url) await supabase.from('records').update({ receipt_url: url }).eq('id', inserted[i].id)
      } catch (e) {
        const code: AppErrorCode = isAppError(e) ? e.appCode : 'ERR-301'
        setErrorModal({ code, detail: e instanceof Error ? e.message : undefined })
      }
    }
    clearDraft(user.id, 'payRows')
    setSavedPayN(valid.length)
    setPayRows([newPayRow()])
    setTimeout(() => setSavedPayN(0), 3000)
    void queryClient.invalidateQueries({ queryKey: ['records', 'today', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthSummary', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthly', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['monthlyUsed', user.id] })
  }

  const totalSelf    = payRows.reduce((acc, r) => acc + r.self_payment, 0)
  const totalSupport = payRows.reduce((acc, r) => acc + r.support_amount, 0)

  return (
    <>
    {errorModal && (
      <ErrorModal
        code={errorModal.code}
        detail={errorModal.detail}
        onClose={() => setErrorModal(null)}
      />
    )}
    {dupWarning.length > 0 && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-5" onClick={() => setDupWarning([])}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          <p className="font-bold text-gray-900 text-base">중복 입력 경고</p>
          <p className="text-sm text-gray-600">
            아래 환자가 <span className="font-semibold">{date}</span>에 이미 기록되어 있습니다.
          </p>
          <ul className="space-y-1">
            {dupWarning.map((name) => (
              <li key={name} className="text-sm font-semibold text-orange-500 bg-orange-50 rounded-lg px-3 py-2">{name}</li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setDupWarning([])} className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl text-sm">취소</button>
            <button
              onClick={async () => { setDupWarning([]); if (tab === 'count') await handleSaveCount(true); else await handleSavePay(true) }}
              className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-sm font-bold active:bg-orange-600"
            >그래도 저장</button>
          </div>
        </div>
      </div>
    )}
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
      <div className="px-4 pt-4 md:max-w-3xl md:mx-auto md:w-full">
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
        <div className="flex-1 px-4 py-4 space-y-4 pb-40 md:max-w-3xl md:mx-auto md:w-full">
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

              <PatientInput
                value={row.patient_name}
                suggestions={recentPatients}
                onChange={(v) => setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, patient_name: v } : r))}
              />

              {countDupNames.has(row.patient_name.trim()) && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">생년 <span className="text-orange-400 font-medium">(동명이인 구분)</span></p>
                  <input
                    type="text"
                    placeholder="예: 2010 또는 20100101"
                    value={row.birth_year ?? ''}
                    onChange={(e) => setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, birth_year: e.target.value } : r))}
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-orange-50/40"
                  />
                </div>
              )}

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

              {/* 횟수 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">
                  횟수{user?.branch_id === '22222222-0000-0000-0000-000000000002' && <span className="text-[#00b4d8] ml-1">(0.5 단위 가능)</span>}
                </p>
                {user?.branch_id === '22222222-0000-0000-0000-000000000002' ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="횟수 입력"
                    value={row._countDisplay ?? String(row.session_count)}
                    onChange={(e) => {
                      const text = e.target.value
                      const num = parseFloat(text)
                      setCountRows((prev) => prev.map((r) => {
                        if (r.id !== row.id) return r
                        const updates: Partial<CountRow> = { _countDisplay: text }
                        if (!isNaN(num) && num > 0) updates.session_count = Math.max(0.5, Math.round(num * 2) / 2)
                        return { ...r, ...updates }
                      }))
                    }}
                    onBlur={(e) => {
                      const n = Math.max(0.5, Math.round((parseFloat(e.target.value) || 0.5) * 2) / 2)
                      setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, session_count: n, _countDisplay: String(n) } : r))
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
                  />
                ) : (
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
                )}
              </div>

              {/* 청구 월 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">청구 월 <span className="text-gray-300">(다른 달 청구건인 경우 변경)</span></p>
                <input
                  type="month"
                  value={row.billing_month ?? date.slice(0, 7)}
                  onChange={(e) => setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, billing_month: e.target.value } : r))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors
                    ${(row.billing_month ?? date.slice(0, 7)) !== date.slice(0, 7)
                      ? 'border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400'
                      : 'border-gray-200 focus:border-[#00b4d8]'}`}
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
        <div className="flex-1 px-4 py-4 space-y-4 pb-52 md:max-w-3xl md:mx-auto md:w-full">
          {payRows.map((row, idx) => (
            <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
                {payRows.length > 1 && (
                  <button
                    onClick={() =>
                      setPayRows((prev) => recalcPayRows(prev.filter((r) => r.id !== row.id), monthlyUsed, branchLimits))
                    }
                    className="text-red-400 text-xs"
                  >
                    삭제
                  </button>
                )}
              </div>

              <PatientInput
                value={row.patient_name}
                suggestions={recentPatients}
                onChange={(v) => updatePayRow(row.id, { patient_name: v })}
              />

              {payDupNames.has(row.patient_name.trim()) && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">생년 <span className="text-orange-400 font-medium">(동명이인 구분)</span></p>
                  <input
                    type="text"
                    placeholder="예: 2010 또는 20100101"
                    value={row.birth_year ?? ''}
                    onChange={(e) => updatePayRow(row.id, { birth_year: e.target.value })}
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-orange-50/40"
                  />
                </div>
              )}

              {(() => {
                const name = row.patient_name.trim()
                if (!name) return null
                const used = monthlyUsed[name] ?? {}
                const badges = (['education', 'sports_voucher', 'after_school'] as PaymentMethod[])
                  .map((m) => ({ m, remaining: Math.max(0, (MONTHLY_SUPPORT_LIMITS[m] ?? 0) - (used[m] ?? 0)) }))
                  .filter((b) => (used[b.m] ?? 0) > 0 && b.remaining > 0)
                if (badges.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map(({ m, remaining }) => (
                      <div key={m} className="flex items-center gap-1.5 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-gray-400">{PAYMENT_METHOD_LABELS[m]}</span>
                        <span className="text-xs font-bold text-[#00b4d8]">{formatKRW(remaining)} 남음</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <RecordFormFields
                state={{
                  fee_type: row.fee_type,
                  unit_price: row.unit_price,
                  session_count: row.session_count,
                  payment_method: row.payment_method,
                  secondary_methods: row.secondary_methods,
                  secondary_overrides: row.secondary_overrides,
                  payment_note: row.payment_note,
                }}
                feeTables={feeTables}
                total={row.total_amount}
                voucherSupports={row.voucherSupports}
                remainingSupport={row.remaining_support}
                selfPayment={row.self_payment}
                onChange={(updates) => updatePayRow(row.id, updates as Partial<PayRow>)}
                branchName={user?.branch_name ?? undefined}
                voucherConfig={voucherConfig}
                allowHalfSession={user?.branch_id === '22222222-0000-0000-0000-000000000002'}
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

              {/* 청구 월 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">청구 월 <span className="text-gray-300">(다른 달 청구건인 경우 변경)</span></p>
                <input
                  type="month"
                  value={row.billing_month ?? date.slice(0, 7)}
                  onChange={(e) => updatePayRow(row.id, { billing_month: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors
                    ${(row.billing_month ?? date.slice(0, 7)) !== date.slice(0, 7)
                      ? 'border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400'
                      : 'border-gray-200 focus:border-[#00b4d8]'}`}
                />
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
            onClick={() => void handleSaveCount()}
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
            <div className="flex justify-between text-sm text-[#7db83a] pb-2">
              <span>지원금 합계</span>
              <span>{formatKRW(totalSupport)}</span>
            </div>
          )}
          <button
            onClick={() => void handleSavePay()}
            disabled={savingPay || payRows.every((r) => !r.patient_name.trim())}
            className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-base active:bg-[#0096b8] disabled:opacity-40 transition-colors"
          >
            {savingPay ? '저장 중...' : '결제 저장하기'}
          </button>
        </div>
      )}
    </div>
    </>
  )
}
