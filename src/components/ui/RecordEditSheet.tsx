import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS, MONTHLY_SUPPORT_LIMITS } from '@/constants'
import { uploadReceipt, deleteReceipt } from '@/lib/storage'
import RecordFormFields from '@/components/ui/RecordFormFields'
import ErrorModal from '@/components/ui/ErrorModal'
import { isAppError } from '@/lib/appErrors'
import { useFeeTables, useMonthlyUsed, useBranchVoucherConfig } from '@/hooks/queries'
import type { Record as SessionRecord, Attendance, PaymentMethod } from '@/types'
import type { AppErrorCode } from '@/lib/appErrors'

const VOUCHER_METHODS: PaymentMethod[] = ['education', 'sports_voucher', 'after_school']

interface EditState {
  date: string
  attendance: Attendance
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  secondary_methods: PaymentMethod[]
  secondary_overrides: Partial<Record<PaymentMethod, number>>
  secondary_unit_prices?: Partial<Record<PaymentMethod, number>>
  secondary_session_counts?: Partial<Record<PaymentMethod, number>>
  payment_note?: string
  billing_month: string
}

interface Props {
  record: SessionRecord
  onSave: (updated: SessionRecord) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function initFromRecord(record: SessionRecord): EditState {
  // 구형 기록 호환: payment_method가 바우처 타입이면 secondary_methods로 이동
  const isLegacyVoucher = (VOUCHER_METHODS as string[]).includes(record.payment_method)
  const primaryMethod: PaymentMethod = isLegacyVoucher ? 'card' : record.payment_method

  const secondaryMethods: PaymentMethod[] = []
  if (isLegacyVoucher) {
    secondaryMethods.push(record.payment_method)
  }
  if (record.secondary_method && (VOUCHER_METHODS as string[]).includes(record.secondary_method)) {
    if (!secondaryMethods.includes(record.secondary_method as PaymentMethod)) {
      secondaryMethods.push(record.secondary_method as PaymentMethod)
    }
  }
  if (record.tertiary_method && (VOUCHER_METHODS as string[]).includes(record.tertiary_method)) {
    if (!secondaryMethods.includes(record.tertiary_method as PaymentMethod)) {
      secondaryMethods.push(record.tertiary_method as PaymentMethod)
    }
  }

  return {
    date: record.date,
    attendance: record.attendance,
    fee_type: record.fee_type,
    unit_price: record.unit_price,
    session_count: record.session_count,
    payment_method: primaryMethod,
    secondary_methods: secondaryMethods,
    secondary_overrides: {},
    payment_note: record.payment_note ?? undefined,
    billing_month: record.billing_month ?? record.date.slice(0, 7),
  }
}

export default function RecordEditSheet({ record, onSave, onDelete, onClose }: Props) {
  const user = useAuthStore((s) => s.user)
  const [state, setState] = useState<EditState>(() => initFromRecord(record))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [receiptAction, setReceiptAction] = useState<'none' | 'upload' | 'delete'>('none')
  const [errorModal, setErrorModal] = useState<{ code: AppErrorCode; detail?: string } | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [showReceiptPicker, setShowReceiptPicker] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const receiptPreview = receiptAction === 'upload' && receiptFile
    ? URL.createObjectURL(receiptFile)
    : receiptAction === 'delete'
    ? null
    : record.receipt_url ?? null

  const { data: feeTables = [] } = useFeeTables(record.branch_id)
  const { data: voucherConfig = [] } = useBranchVoucherConfig(record.branch_id)
  // record.date가 아닌 해당 월 말일로 조회해야 이후 기록까지 반영됨
  const recordYM = record.date.slice(0, 7)
  const [ry, rm] = recordYM.split('-').map(Number)
  const endOfRecordMonth = new Date(ry, rm, 0).toISOString().slice(0, 10)
  const { data: allMonthlyUsed = {} } = useMonthlyUsed(record.teacher_id, endOfRecordMonth)

  // 현재 레코드를 제외한 이달 지원금 사용량
  const monthlyUsed: Record<PaymentMethod, number> = {
    ...(allMonthlyUsed[record.patient_name] ?? {
      education: 0, sports_voucher: 0, after_school: 0,
      card: 0, cash: 0, bank_transfer: 0, other: 0,
    }),
  }
  // 구형: payment_method가 바우처면 primary support 빼기
  if ((VOUCHER_METHODS as string[]).includes(record.payment_method)) {
    const primarySupport = record.support_amount - (record.secondary_support ?? 0)
    monthlyUsed[record.payment_method as PaymentMethod] = Math.max(
      0, (monthlyUsed[record.payment_method as PaymentMethod] ?? 0) - primarySupport,
    )
  }
  // secondary 빼기
  if (record.secondary_method && (VOUCHER_METHODS as string[]).includes(record.secondary_method)) {
    const sm = record.secondary_method as PaymentMethod
    monthlyUsed[sm] = Math.max(0, (monthlyUsed[sm] ?? 0) - record.secondary_support)
  }
  // tertiary 빼기
  if (record.tertiary_method && (VOUCHER_METHODS as string[]).includes(record.tertiary_method)) {
    const tm = record.tertiary_method as PaymentMethod
    monthlyUsed[tm] = Math.max(0, (monthlyUsed[tm] ?? 0) - (record.tertiary_support ?? 0))
  }

  const update = (patch: Partial<EditState>) => setState((prev) => ({ ...prev, ...patch }))

  const total = state.attendance === 'absent' ? 0 : state.unit_price * state.session_count

  // 바우처별 실제 지원금: 직접입력은 순서대로 처리, 자동계산은 잔여 금액을 비례 배분
  const voucherSupports: Partial<Record<PaymentMethod, number>> = {}
  if (state.attendance === 'absent') {
    for (const m of state.secondary_methods) voucherSupports[m] = 0
  } else {
    const overrideMethods = state.secondary_methods.filter((m) => state.secondary_overrides[m] !== undefined)
    const autoMethods = state.secondary_methods.filter((m) => state.secondary_overrides[m] === undefined)

    let remAfterOverride = total
    for (const method of overrideMethods) {
      const cap = calcSupport(remAfterOverride, method, monthlyUsed[method] ?? 0, state.secondary_overrides[method]).support
      voucherSupports[method] = cap
      remAfterOverride -= cap
    }

    const autoRawCaps: Partial<Record<PaymentMethod, number>> = {}
    for (const method of autoMethods) {
      autoRawCaps[method] = calcSupport(remAfterOverride, method, monthlyUsed[method] ?? 0, undefined).support
    }
    const totalAutoCap = Object.values(autoRawCaps).reduce((a, b) => a + (b ?? 0), 0)
    if (totalAutoCap <= 0) {
      for (const m of autoMethods) voucherSupports[m] = 0
    } else if (totalAutoCap <= remAfterOverride) {
      for (const m of autoMethods) voucherSupports[m] = autoRawCaps[m] ?? 0
    } else {
      let allocated = 0
      for (let i = 0; i < autoMethods.length; i++) {
        const m = autoMethods[i]
        if (i === autoMethods.length - 1) {
          voucherSupports[m] = Math.max(0, remAfterOverride - allocated)
        } else {
          const share = Math.floor(remAfterOverride * ((autoRawCaps[m] ?? 0) / totalAutoCap))
          voucherSupports[m] = Math.min(share, autoRawCaps[m] ?? 0)
          allocated += voucherSupports[m]!
        }
      }
    }
  }

  const totalSupportUsed = Object.values(voucherSupports).reduce((a, b) => a + (b ?? 0), 0)
  const autoRemainingSupport = state.secondary_methods.reduce((acc, method) => {
    const limit = MONTHLY_SUPPORT_LIMITS[method] ?? 0
    return acc + Math.max(0, limit - (monthlyUsed[method] ?? 0) - (voucherSupports[method] ?? 0))
  }, 0)
  const selfPayment = Math.max(0, total - totalSupportUsed)

  const handleSave = async () => {
    setSaving(true)

    let newReceiptUrl: string | null | undefined = undefined
    if (receiptAction === 'upload' && receiptFile) {
      try {
        newReceiptUrl = await uploadReceipt(receiptFile, record.teacher_id, record.id)
      } catch (e) {
        setSaving(false)
        const code: AppErrorCode = isAppError(e) ? e.appCode : 'ERR-301'
        setErrorModal({ code, detail: e instanceof Error ? e.message : undefined })
        return
      }
    } else if (receiptAction === 'delete') {
      await deleteReceipt(record.teacher_id, record.id)
      newReceiptUrl = null
    }

    const secondarySupport = voucherSupports[state.secondary_methods[0]] ?? 0
    const tertiarySupport = voucherSupports[state.secondary_methods[1]] ?? 0

    const updatePayload: Record<string, unknown> = {
      date: state.date,
      attendance: state.attendance,
      billing_month: state.billing_month,
      fee_type: state.attendance === 'absent' ? record.fee_type : state.fee_type || '직접입력',
      unit_price: state.attendance === 'absent' ? 0 : state.unit_price,
      session_count: state.session_count,
      total_amount: total,
      payment_method: state.payment_method,
      payment_note: state.payment_method === 'other' ? (state.payment_note || null) : null,
      support_amount: totalSupportUsed,
      secondary_method: state.secondary_methods[0] ?? null,
      secondary_support: secondarySupport,
      tertiary_method: state.secondary_methods[1] ?? null,
      tertiary_support: tertiarySupport,
      remaining_support: autoRemainingSupport,
      self_payment: selfPayment,
      updated_by_name: user?.name ?? null,
    }
    if (newReceiptUrl !== undefined) updatePayload.receipt_url = newReceiptUrl

    const { error } = await supabase.from('records').update(updatePayload).eq('id', record.id)

    setSaving(false)
    if (error) {
      setErrorModal({ code: 'ERR-102', detail: error.message })
    } else {
      const updatedRecord: SessionRecord = {
        ...record,
        ...updatePayload,
        receipt_url: newReceiptUrl !== undefined ? newReceiptUrl : record.receipt_url,
      } as SessionRecord
      onSave(updatedRecord)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`"${record.patient_name}" 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`))
      return
    setDeleting(true)
    const { error } = await supabase.from('records').delete().eq('id', record.id)
    setDeleting(false)
    if (error) {
      setErrorModal({ code: 'ERR-103', detail: error.message })
    } else {
      onDelete(record.id)
    }
  }

  return (
    <>
    {errorModal && (
      <ErrorModal
        code={errorModal.code}
        detail={errorModal.detail}
        onClose={() => setErrorModal(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative bg-white rounded-t-2xl max-h-[88dvh] overflow-y-auto md:rounded-2xl md:max-h-[90dvh] md:w-full md:max-w-md md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모바일 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white md:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-8 space-y-4 md:px-6 md:pt-5 md:pb-6">
          {/* 헤더 */}
          <div className="flex justify-between items-center pt-1">
            <div>
              <h2 className="font-bold text-gray-900 text-base">{record.patient_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">기록 수정</p>
            </div>
            <button onClick={onClose} className="text-gray-400 text-xl px-1">×</button>
          </div>

          {/* 날짜 */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">날짜</p>
            <input
              type="date"
              value={state.date}
              onChange={(e) => update({ date: e.target.value })}
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors
                ${state.date !== record.date
                  ? 'border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400'
                  : 'border-gray-200 focus:border-[#00b4d8]'}`}
            />
          </div>

          {/* 출결 */}
          <div className="flex gap-2">
            {(['present', 'absent', 'makeup'] as Attendance[]).map((a) => (
              <button
                key={a}
                onClick={() => update({ attendance: a })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    state.attendance === a
                      ? a === 'absent'
                        ? 'bg-[#e85b8a] text-white'
                        : a === 'makeup'
                        ? 'bg-[#7db83a] text-white'
                        : 'bg-[#00b4d8] text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
              >
                {ATTENDANCE_LABELS[a]}
              </button>
            ))}
          </div>

          {/* 결제 기록일 때만 결제 관련 항목 표시 */}
          {state.attendance === 'payment' && (
            <>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">청구 월 <span className="text-gray-300">(다른 달 청구건인 경우 변경)</span></p>
                {state.billing_month.includes(',') ? (
                  <div className="w-full border border-orange-300 bg-orange-50 rounded-lg px-3 py-2 text-sm text-orange-700">
                    {state.billing_month.split(',').map((m) => `${m.slice(5)}월`).join(', ')} 청구건
                  </div>
                ) : (
                  <input
                    type="month"
                    value={state.billing_month}
                    onChange={(e) => update({ billing_month: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors
                      ${state.billing_month !== record.date.slice(0, 7)
                        ? 'border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400'
                        : 'border-gray-200 focus:border-[#00b4d8]'}`}
                  />
                )}
              </div>

              <RecordFormFields
                state={state}
                feeTables={feeTables}
                total={total}
                voucherSupports={voucherSupports}
                remainingSupport={autoRemainingSupport}
                selfPayment={selfPayment}
                onChange={update}
                voucherConfig={voucherConfig}
                allowHalfSession={record.branch_id === '22222222-0000-0000-0000-000000000002'}
              />
            </>
          )}

          {/* 영수증 — 결제 기록일 때만 */}
          {state.attendance === 'payment' && <div>
            <p className="text-xs text-gray-400 mb-1.5">영수증 사진</p>
            {receiptPreview ? (
              <div className="relative">
                <img
                  src={receiptPreview}
                  alt="영수증"
                  className="w-full rounded-xl object-cover max-h-52 cursor-pointer"
                  onClick={() => window.open(receiptPreview, '_blank')}
                />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => setShowReceiptPicker(true)}
                    className="px-2.5 py-1 rounded-full bg-black/50 text-white text-xs"
                  >
                    사진
                  </button>
                  <button
                    onClick={() => { setReceiptAction('delete'); setReceiptFile(null) }}
                    className="px-2.5 py-1 rounded-full bg-black/50 text-white text-xs"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReceiptPicker(true)}
                className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm active:bg-gray-50 transition-colors"
              >
                사진 첨부
              </button>
            )}
          </div>}

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="py-3 px-4 border border-red-200 text-red-500 rounded-xl text-sm font-medium disabled:opacity-40 active:bg-red-50 transition-colors"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="py-3 px-4 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium disabled:opacity-40 active:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex-1 py-3 bg-[#00b4d8] text-white rounded-xl text-sm font-bold disabled:opacity-40 active:bg-[#0096b8] transition-colors"
            >
              {saving ? '저장 중…' : '수정 저장'}
            </button>
          </div>

        </div>
      </div>
    </div>

    {/* 영수증 입력 소스 선택 — 숨겨진 inputs */}
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setReceiptFile(f); setReceiptAction('upload') }; e.target.value = ''; setShowReceiptPicker(false) }}
    />
    <input ref={galleryRef} type="file" accept="image/*" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setReceiptFile(f); setReceiptAction('upload') }; e.target.value = ''; setShowReceiptPicker(false) }}
    />
    <input ref={fileRef} type="file" className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) { setReceiptFile(f); setReceiptAction('upload') }; e.target.value = ''; setShowReceiptPicker(false) }}
    />

    {/* 영수증 소스 선택 바텀시트 */}
    {showReceiptPicker && (
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowReceiptPicker(false)}>
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
    </>
  )
}
