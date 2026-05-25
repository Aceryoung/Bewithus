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
import { useFeeTables, useMonthlyUsed, qk } from '@/hooks/queries'
import type { Attendance, PaymentMethod } from '@/types'

interface Row {
  id: string
  patient_name: string
  attendance: Attendance
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  support_amount: number
  self_payment: number
  total_amount: number
  after_school_support?: number
  payment_note?: string
  receiptFile?: File
  skip_amount: boolean
}

function newRow(): Row {
  return {
    id: crypto.randomUUID(),
    patient_name: '',
    attendance: 'present',
    fee_type: '',
    unit_price: 0,
    session_count: 1,
    payment_method: 'card',
    support_amount: 0,
    self_payment: 0,
    total_amount: 0,
    skip_amount: false,
  }
}

function recalculateRows(
  rows: Row[],
  monthlyUsed: Record<string, Record<PaymentMethod, number>>,
): Row[] {
  const inFormAccum: Record<string, Partial<Record<PaymentMethod, number>>> = {}

  return rows.map((row) => {
    const name = row.patient_name.trim()

    if (name && !inFormAccum[name]) inFormAccum[name] = {}

    if (row.attendance === 'absent' || row.skip_amount) {
      return { ...row, total_amount: 0, support_amount: 0, self_payment: 0 }
    }

    const dbUsed     = name ? (monthlyUsed[name]?.[row.payment_method] ?? 0) : 0
    const inFormUsed = name ? (inFormAccum[name][row.payment_method] ?? 0) : 0
    const totalUsed  = dbUsed + inFormUsed

    const total = row.unit_price * row.session_count
    const { support, selfPayment } = calcSupport(total, row.payment_method, totalUsed, row.after_school_support)

    if (name) {
      inFormAccum[name][row.payment_method] = (inFormAccum[name][row.payment_method] ?? 0) + support
    }

    return { ...row, total_amount: total, support_amount: support, self_payment: selfPayment }
  })
}

export default function DailyInputPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const { data: feeTables = [] } = useFeeTables(user?.branch_id ?? null)
  const { data: monthlyUsed = {} } = useMonthlyUsed(user?.id ?? null, date)

  useEffect(() => {
    setRows((prev: Row[]) => recalculateRows(prev, monthlyUsed))
  }, [monthlyUsed])

  const updateRow = (id: string, updates: Partial<Row>) => {
    setRows((prev: Row[]) => {
      const patched = prev.map((row) => (row.id === id ? { ...row, ...updates } : row))
      return recalculateRows(patched, monthlyUsed)
    })
  }

  const handleSave = async () => {
    if (!user) return
    if (!user.branch_id) {
      alert('호점이 배정되지 않은 계정입니다. 대표에게 문의하세요.')
      return
    }
    const validRows = rows.filter((r) => r.patient_name.trim())
    if (validRows.length === 0) return

    setSaving(true)
    const { data: inserted, error } = await supabase.from('records').insert(
      validRows.map((r) => ({
        teacher_id: user.id,
        branch_id: user.branch_id,
        date,
        patient_name: r.patient_name.trim(),
        attendance: r.attendance,
        fee_type: r.skip_amount ? '금액없음' : (r.fee_type || '직접입력'),
        session_count: r.session_count,
        unit_price: r.skip_amount ? 0 : r.unit_price,
        total_amount: r.total_amount,
        payment_method: r.payment_method,
        payment_note: r.payment_note || null,
        support_amount: r.support_amount,
        self_payment: r.self_payment,
      })),
    ).select('id')
    setSaving(false)

    if (error || !inserted) {
      alert(`저장 실패: ${error?.message ?? '알 수 없는 오류'}\n\n입력 내용은 그대로 유지됩니다. 다시 시도해주세요.`)
      return
    }

    // 영수증 이미지 업로드 (첨부된 행만)
    for (let i = 0; i < inserted.length; i++) {
      const file = validRows[i].receiptFile
      if (!file) continue
      const url = await uploadReceipt(file, user.id, inserted[i].id)
      if (url) {
        await supabase.from('records').update({ receipt_url: url }).eq('id', inserted[i].id)
      }
    }

    setSavedCount(validRows.length)
    setRows([newRow()])
    setTimeout(() => setSavedCount(0), 3000)

    // 저장 후 오늘 기록·요약·이달 지원금 캐시 무효화
    if (user) {
      const today = todayStr()
      const now2 = new Date()
      const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-01`
      queryClient.invalidateQueries({ queryKey: qk.todayRecords(user.id, today) })
      queryClient.invalidateQueries({ queryKey: qk.monthSummary(user.id, monthStart) })
      queryClient.invalidateQueries({ queryKey: qk.monthlyUsed(user.id, date) })
    }
  }

  const totalSelfPayment = rows.reduce((acc, r) => acc + r.self_payment, 0)
  const totalSupport = rows.reduce((acc, r) => acc + r.support_amount, 0)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <SavedToast count={savedCount} />
      <PageHeader title="일 건수 입력" showBack />

      <div className="flex-1 px-4 py-4 space-y-4 pb-52">
        {/* 날짜 선택 */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-500 shrink-0">날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 text-sm font-medium text-gray-900 outline-none bg-transparent"
          />
        </div>

        {/* 환자 행 목록 */}
        {rows.map((row, idx) => (
          <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
              {rows.length > 1 && (
                <button
                  onClick={() =>
                    setRows((prev: Row[]) =>
                      recalculateRows(prev.filter((r) => r.id !== row.id), monthlyUsed),
                    )
                  }
                  className="text-red-400 text-xs"
                >
                  삭제
                </button>
              )}
            </div>

            {/* 환자명 */}
            <input
              type="text"
              placeholder="환자명 입력"
              value={row.patient_name}
              onChange={(e) =>
                updateRow(row.id, {
                  patient_name: e.target.value.replace(/[0-9]/g, '').slice(0, 20),
                })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
            />

            {/* 출결 */}
            <div className="flex gap-2">
              {(['present', 'absent', 'makeup'] as Attendance[]).map((a) => (
                <button
                  key={a}
                  onClick={() => updateRow(row.id, { attendance: a })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                    ${row.attendance === a
                      ? a === 'absent'
                        ? 'bg-[#e85b8a] text-white'
                        : a === 'makeup'
                        ? 'bg-[#7db83a] text-white'
                        : 'bg-[#00b4d8] text-white'
                      : 'bg-gray-100 text-gray-500'}`}
                >
                  {ATTENDANCE_LABELS[a]}
                </button>
              ))}
            </div>

            {/* 금액 없음 토글 (결석 제외) */}
            {row.attendance !== 'absent' && (
              <button
                onClick={() => updateRow(row.id, { skip_amount: !row.skip_amount })}
                className={`w-full py-2 rounded-lg text-sm font-medium border transition-colors
                  ${row.skip_amount
                    ? 'bg-gray-100 border-gray-300 text-gray-500'
                    : 'bg-white border-gray-200 text-gray-400'}`}
              >
                {row.skip_amount ? '✓ 금액 없음 (건수만 기록)' : '금액 없음으로 저장'}
              </button>
            )}

            {/* 요금 종류 / 횟수 / 결제방식 / 금액 미리보기 / 영수증 (결석·금액없음 제외) */}
            {row.attendance !== 'absent' && !row.skip_amount && (
              <>
                <RecordFormFields
                  state={{
                    fee_type: row.fee_type,
                    unit_price: row.unit_price,
                    session_count: row.session_count,
                    payment_method: row.payment_method,
                    secondary_methods: [],
                    secondary_overrides: {},
                    payment_note: row.payment_note,
                  }}
                  feeTables={feeTables}
                  total={row.total_amount}
                  voucherSupports={{}}
                  remainingSupport={0}
                  selfPayment={row.self_payment}
                  onChange={(updates) => updateRow(row.id, updates as Partial<Row>)}
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
                        onClick={() => updateRow(row.id, { receiptFile: undefined })}
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
                          if (file) updateRow(row.id, { receiptFile: file })
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {/* 행 추가 버튼 */}
        <button
          onClick={() => setRows((prev: Row[]) => [...prev, newRow()])}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm font-medium active:bg-gray-50 transition-colors"
        >
          + 환자 추가
        </button>
      </div>

      <BottomNav />

      {/* 저장 버튼 고정 (BottomNav 위) */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-3 pt-2 bg-white border-t border-gray-100 shadow-lg">
        <div className="flex justify-between text-sm text-gray-500 py-2">
          <span>자부담 합계</span>
          <span className="font-bold text-gray-900">{formatKRW(totalSelfPayment)}</span>
        </div>
        {totalSupport > 0 && (
          <div className="flex justify-between text-sm text-[#00b4d8] pb-2">
            <span>지원금 합계</span>
            <span>{formatKRW(totalSupport)}</span>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving || rows.every((r) => !r.patient_name.trim())}
          className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-base active:bg-[#0096b8] disabled:opacity-40 transition-colors"
        >
          {saving ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </div>
  )
}
