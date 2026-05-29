import { useState, useEffect, useMemo, useRef } from 'react'
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
import { useFeeTables, useMonthlyUsed, useRecentPatients, useBranchVoucherConfig, usePatientLastVouchers, usePatientRemainingSupport } from '@/hooks/queries'
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
  secondary_unit_prices?: Partial<Record<PaymentMethod, number>>
  secondary_session_counts?: Partial<Record<PaymentMethod, number>>
  voucherSupports: Partial<Record<PaymentMethod, number>>
  support_amount: number
  secondary_support: number
  tertiary_support: number
  remaining_support: number
  self_payment: number
  total_amount: number
  payment_note?: string
  billing_months: string[]
  receiptFile?: File
  applied_remaining?: number
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
    billing_months: [],
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

    // 바우처별 실제 지원금
    // - 직접입력(override): 각각 입력한 금액 그대로 적용 (캐스케이드 없음)
    // - 자동계산(auto): override 합계 초과분을 비례 배분
    const actualSupports: Partial<Record<PaymentMethod, number>> = {}
    const overrideMethods = row.secondary_methods.filter((m) => row.secondary_overrides[m] !== undefined)
    const autoMethods = row.secondary_methods.filter((m) => row.secondary_overrides[m] === undefined)

    let totalOverrideSupport = 0
    for (const method of overrideMethods) {
      const amt = row.secondary_overrides[method] ?? 0
      actualSupports[method] = amt
      totalOverrideSupport += amt
    }

    // 자동계산 바우처는 override 합계를 초과하는 총 요금에서만 배분
    const remForAuto = Math.max(0, total - totalOverrideSupport)
    const autoRawCaps: Partial<Record<PaymentMethod, number>> = {}
    for (const method of autoMethods) {
      const dbUsed = name ? (monthlyUsed[name]?.[method] ?? 0) : 0
      const formUsed = name ? (inFormAccum[name]?.[method] ?? 0) : 0
      autoRawCaps[method] = calcSupport(remForAuto, method, dbUsed + formUsed, undefined, branchLimits).support
    }
    const totalAutoCap = Object.values(autoRawCaps).reduce((a, b) => a + (b ?? 0), 0)
    if (totalAutoCap <= 0) {
      for (const m of autoMethods) actualSupports[m] = 0
    } else if (totalAutoCap <= remForAuto) {
      for (const m of autoMethods) actualSupports[m] = autoRawCaps[m] ?? 0
    } else {
      let allocated = 0
      for (let i = 0; i < autoMethods.length; i++) {
        const m = autoMethods[i]
        if (i === autoMethods.length - 1) {
          actualSupports[m] = Math.max(0, remForAuto - allocated)
        } else {
          const share = Math.floor(remForAuto * ((autoRawCaps[m] ?? 0) / totalAutoCap))
          actualSupports[m] = Math.min(share, autoRawCaps[m] ?? 0)
          allocated += actualSupports[m]!
        }
      }
    }

    const totalSupportUsed = Object.values(actualSupports).reduce((a, b) => a + (b ?? 0), 0)
    // 남은 지원금 = 바우처 합계가 총 요금을 초과하는 차액 (다음 결제 시 사용 가능)
    const remainingCredit = Math.max(0, totalSupportUsed - total)

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
      remaining_support: remainingCredit,
      self_payment: Math.max(0, total - totalSupportUsed - (row.applied_remaining ?? 0)),
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
  const [payRows, setPayRows] = useState<PayRow[]>([newPayRow()])
  const [savingPay, setSavingPay] = useState(false)
  const [savedPayN, setSavedPayN] = useState(0)
  const [errorModal, setErrorModal] = useState<{ code: AppErrorCode; detail?: string } | null>(null)
  const [dupWarning, setDupWarning] = useState<string[]>([])
  const [receiptPickerCb, setReceiptPickerCb] = useState<((file: File) => void) | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: feeTables = [] } = useFeeTables(user?.branch_id ?? null)
  const { data: monthlyUsed = {} } = useMonthlyUsed(user?.id ?? null, date.slice(0, 7))
  const { data: recentPatients = [] } = useRecentPatients(user?.id ?? null)
  const { data: voucherConfig } = useBranchVoucherConfig(user?.branch_id ?? null)
  const { data: patientLastVouchers = {} } = usePatientLastVouchers(user?.id ?? null)
  const { data: patientRemainingSupport = {} } = usePatientRemainingSupport(user?.id ?? null)

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

  // patientLastVouchers 로드 완료 시 환자명이 있는 빈 행에 자동 적용
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPayRows((prev) => {
      let changed = false
      const updated = prev.map((row) => {
        if (!row.patient_name.trim() || row.secondary_methods.length > 0) return row
        const vouchers = patientLastVouchers[row.patient_name.trim()]
        if (!vouchers?.length) return row
        changed = true
        return { ...row, secondary_methods: vouchers }
      })
      if (!changed) return prev
      return recalcPayRows(updated, monthlyUsed, branchLimits)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientLastVouchers])

  /* ── 임시저장 (변경될 때마다) ── */
  useEffect(() => {
    if (!user) return
    saveDraft(user.id, 'countRows', countRows)
  }, [countRows, user])


  const updatePayRow = (id: string, updates: Partial<PayRow>) => {
    setPayRows((prev) => {
      const patched = prev.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...updates }
        // 환자명이 입력되고 바우처가 선택되지 않은 상태 → 이전 기록에서 자동 적용
        if ('patient_name' in updates) {
          next.applied_remaining = undefined
          if (next.patient_name.trim() && next.secondary_methods.length === 0) {
            const vouchers = patientLastVouchers[next.patient_name.trim()]
            if (vouchers?.length) next.secondary_methods = vouchers
          }
        }
        return next
      })
      return recalcPayRows(patched, monthlyUsed, branchLimits)
    })
  }

  /* ── 건수 저장 ── */
  const handleSaveCount = async (force = false) => {
    if (!user) return
    if (!user.branch_id) { setErrorModal({ code: 'ERR-401' }); return }
    const valid = countRows.filter((r) => r.patient_name.trim())
    if (valid.length === 0) return

    /* ── 중복 체크 (건수 탭 내 동일 날짜·동일 이름만 검사) ── */
    if (!force) {
      const { data: existing } = await supabase
        .from('records').select('patient_name').eq('teacher_id', user.id).eq('date', date).neq('attendance', 'payment')
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

    /* ── 중복 체크 (결제 탭 내 동일 날짜·동일 이름만 검사) ── */
    if (!force) {
      const { data: existing2 } = await supabase
        .from('records').select('patient_name').eq('teacher_id', user.id).eq('date', date).eq('attendance', 'payment')
      const existingNames2 = new Set((existing2 ?? []).map((r) => r.patient_name))
      const dups2 = valid.map((r) => r.patient_name.trim()).filter((n) => existingNames2.has(n))
      if (dups2.length > 0) {
        setDupWarning(dups2)
        return
      }
    }

    setSavingPay(true)
    // 여러 달 선택 시 쉼표로 이어 1개 레코드에 저장 (4월+5월 동시 납부 등)
    const { data: inserted, error } = await supabase.from('records').insert(
      valid.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        billing_month: r.billing_months.length > 0 ? r.billing_months.join(',') : date.slice(0, 7),
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
        await supabase.from('records').update({ receipt_url: url }).eq('id', inserted[i].id)
      } catch (e) {
        const code: AppErrorCode = isAppError(e) ? e.appCode : 'ERR-301'
        setErrorModal({ code, detail: e instanceof Error ? e.message : undefined })
      }
    }
    // 이전 남은 지원금 사용 시 해당 레코드 차감
    for (const r of valid) {
      if ((r.applied_remaining ?? 0) > 0) {
        const rs = patientRemainingSupport[r.patient_name.trim()]
        if (rs) {
          const newRemaining = Math.max(0, rs.amount - (r.applied_remaining ?? 0))
          await supabase.from('records').update({ remaining_support: newRemaining }).eq('id', rs.recordId)
        }
      }
    }

    setSavedPayN(inserted.length)
    setPayRows([newPayRow()])
    setTimeout(() => setSavedPayN(0), 3000)
    void queryClient.invalidateQueries({ queryKey: ['records', 'today', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthSummary', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['records', 'monthly', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['monthlyUsed', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['patientLastVouchers', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['patientRemainingSupport', user.id] })
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
                const limits = branchLimits ?? MONTHLY_SUPPORT_LIMITS
                const voucherMethods = voucherConfig?.map((c) => c.payment_method as PaymentMethod)
                  ?? (user?.branch_name ? BRANCH_VOUCHER_CONFIG[user.branch_name]?.methods?.filter((m) => !['card','cash','bank_transfer','other'].includes(m)) as PaymentMethod[] : undefined)
                  ?? ['education', 'sports_voucher', 'after_school'] as PaymentMethod[]
                const badges = voucherMethods
                  .map((m) => ({ m, remaining: Math.max(0, (limits[m] ?? 0) - (used[m] ?? 0)) }))
                  .filter((b) => (used[b.m] ?? 0) > 0 && b.remaining > 0)
                if (badges.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map(({ m, remaining }) => (
                      <div key={m} className="flex items-center gap-1.5 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-gray-400">{PAYMENT_METHOD_LABELS[m] ?? m}</span>
                        <span className="text-xs font-bold text-[#00b4d8]">{formatKRW(remaining)} 남음</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* 이전 남은 지원금 불러오기 */}
              {(() => {
                const name = row.patient_name.trim()
                if (!name) return null
                const rs = patientRemainingSupport[name]
                if (!rs || rs.amount <= 0) return null
                const applied = row.applied_remaining ?? 0
                if (applied > 0) {
                  return (
                    <div className="flex items-center justify-between bg-[#e8f7fb] border border-[#00b4d8]/20 rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-xs text-[#007a93] font-medium">이전 남은 지원금 적용됨</p>
                        <p className="text-xs text-[#00b4d8] font-bold">−{formatKRW(applied)}</p>
                      </div>
                      <button
                        onClick={() => updatePayRow(row.id, { applied_remaining: undefined })}
                        className="text-xs text-gray-400 underline"
                      >
                        취소
                      </button>
                    </div>
                  )
                }
                return (
                  <button
                    onClick={() => updatePayRow(row.id, { applied_remaining: rs.amount })}
                    className="w-full flex items-center justify-between bg-[#f0f9e8] border border-[#7db83a]/30 rounded-xl px-3 py-2.5 active:bg-[#e4f4d4] transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-xs text-[#5a8a28] font-medium">이전 남은 지원금</p>
                      <p className="text-xs text-[#7db83a] font-bold">{formatKRW(rs.amount)}</p>
                    </div>
                    <span className="text-xs text-[#7db83a] font-semibold">적용하기 →</span>
                  </button>
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
                  secondary_unit_prices: row.secondary_unit_prices,
                  secondary_session_counts: row.secondary_session_counts,
                  payment_note: row.payment_note,
                }}
                feeTables={feeTables}
                total={row.total_amount}
                voucherSupports={row.voucherSupports}
                remainingSupport={row.remaining_support}
                appliedRemaining={row.applied_remaining}
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
                  <button
                    onClick={() => setReceiptPickerCb(() => (file: File) => updatePayRow(row.id, { receiptFile: file }))}
                    className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm active:bg-gray-50 transition-colors"
                  >
                    사진 첨부
                  </button>
                )}
              </div>

              {/* 청구 월 (복수 선택 가능) */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">
                  청구 월 <span className="text-gray-300">(여러 달 선택 가능)</span>
                </p>
                <input
                  type="month"
                  value=""
                  onChange={(e) => {
                    const m = e.target.value
                    if (!m || row.billing_months.includes(m)) return
                    updatePayRow(row.id, { billing_months: [...row.billing_months, m].sort() })
                    e.target.value = ''
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
                />
                {row.billing_months.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {row.billing_months.map((m) => (
                      <span key={m} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${m === date.slice(0, 7) ? 'bg-[#e8f7fb] text-[#00b4d8]' : 'bg-orange-50 text-orange-500'}`}>
                        {m.slice(0, 4)}년 {m.slice(5)}월
                        <button type="button" onClick={() => updatePayRow(row.id, { billing_months: row.billing_months.filter((bm) => bm !== m) })} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1.5 min-h-[1rem]">
                  {row.billing_months.length === 0
                    ? <span className="text-red-400">청구 월을 1개 이상 선택해주세요</span>
                    : <>선택: {row.billing_months.map((m) => `${m.slice(5)}월`).join(', ')}{row.billing_months.length > 1 && <span className="text-[#00b4d8]">({row.billing_months.length}개월)</span>}</>
                  }
                </p>
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

      {/* 영수증 입력 소스 선택 — 숨겨진 inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && receiptPickerCb) receiptPickerCb(f); e.target.value = ''; setReceiptPickerCb(null) }}
      />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && receiptPickerCb) receiptPickerCb(f); e.target.value = ''; setReceiptPickerCb(null) }}
      />
      <input ref={fileRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && receiptPickerCb) receiptPickerCb(f); e.target.value = ''; setReceiptPickerCb(null) }}
      />

      {/* 영수증 소스 선택 바텀시트 */}
      {receiptPickerCb && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setReceiptPickerCb(null)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-4 pt-5 pb-10" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm text-gray-400 mb-4">사진 등록 방법 선택</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => cameraRef.current?.click()} className="w-full py-3.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">카메라</button>
              <button onClick={() => galleryRef.current?.click()} className="w-full py-3.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">사진첩</button>
              <button onClick={() => fileRef.current?.click()} className="w-full py-3.5 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium active:bg-gray-100 transition-colors">파일</button>
            </div>
          </div>
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
            disabled={savingPay || payRows.every((r) => !r.patient_name.trim()) || payRows.some((r) => r.patient_name.trim() && r.billing_months.length === 0)}
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
