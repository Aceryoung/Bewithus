import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS } from '@/constants'
import { uploadReceipt } from '@/lib/storage'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import RecordFormFields from '@/components/ui/RecordFormFields'
import type { Attendance, PaymentMethod, FeeTable } from '@/types'

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
  }
}

/**
 * 폼 내 모든 행을 위에서 아래 순서로 순차 재계산.
 * 같은 환자·결제방식의 앞 행이 먼저 지원금 한도를 소진하고,
 * 뒤 행은 남은 한도 안에서만 지원금을 받음.
 *
 * monthlyUsed: DB에서 가져온 이달 기저 사용량 (이미 저장된 기록)
 */
function recalculateRows(
  rows: Row[],
  monthlyUsed: Record<string, Record<PaymentMethod, number>>,
): Row[] {
  // 폼 내 누적 지원금 (환자명 → 결제방식 → 누적액)
  const inFormAccum: Record<string, Partial<Record<PaymentMethod, number>>> = {}

  return rows.map((row) => {
    const name = row.patient_name.trim()

    if (name && !inFormAccum[name]) inFormAccum[name] = {}

    const dbUsed    = name ? (monthlyUsed[name]?.[row.payment_method] ?? 0) : 0
    const inFormUsed = name ? (inFormAccum[name][row.payment_method] ?? 0) : 0
    const totalUsed = dbUsed + inFormUsed

    const total =
      row.attendance === 'absent' ? 0 : row.unit_price * row.session_count

    const { support, selfPayment } =
      row.attendance === 'absent'
        ? { support: 0, selfPayment: 0 }
        : calcSupport(total, row.payment_method, totalUsed, row.after_school_support)

    // 이 행의 지원금을 다음 행 계산에 반영
    if (name) {
      inFormAccum[name][row.payment_method] = (inFormAccum[name][row.payment_method] ?? 0) + support
    }

    return { ...row, total_amount: total, support_amount: support, self_payment: selfPayment }
  })
}

export default function DailyInputPage() {
  const user = useAuthStore((s) => s.user)

  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [feeTables, setFeeTables] = useState<FeeTable[]>([])
  const [monthlyUsed, setMonthlyUsed] = useState<Record<string, Record<PaymentMethod, number>>>({})
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    if (!user?.branch_id) return
    supabase
      .from('fee_tables')
      .select('*')
      .eq('branch_id', user.branch_id)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setFeeTables(data as FeeTable[])
      })
  }, [user])

  // 이달 지원금 사용량 불러오기 (환자별)
  useEffect(() => {
    if (!user) return
    const now = new Date(date)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    supabase
      .from('records')
      .select('patient_name, payment_method, support_amount')
      .eq('teacher_id', user.id)
      .gte('date', monthStart)
      .lte('date', date)
      .then(({ data }) => {
        if (!data) return
        const used: Record<string, Record<PaymentMethod, number>> = {}
        for (const r of data) {
          if (!used[r.patient_name]) {
            used[r.patient_name] = {
              education: 0, sports_voucher: 0, after_school: 0, card: 0, cash: 0, bank_transfer: 0, other: 0,
            }
          }
          used[r.patient_name][r.payment_method as PaymentMethod] += r.support_amount
        }
        setMonthlyUsed(used)
      })
  }, [date, user])

  // monthlyUsed가 갱신되면 폼 내 모든 행 재계산 (날짜 변경 시 포함)
  useEffect(() => {
    setRows((prev) => recalculateRows(prev, monthlyUsed))
  }, [monthlyUsed])

  // 특정 행 업데이트 후 전체 행 순차 재계산
  const updateRow = (id: string, updates: Partial<Row>) => {
    setRows((prev) => {
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
        fee_type: r.fee_type || '직접입력',
        session_count: r.session_count,
        unit_price: r.unit_price,
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
  }

  const totalSelfPayment = rows.reduce((acc, r) => acc + r.self_payment, 0)
  const totalSupport = rows.reduce((acc, r) => acc + r.support_amount, 0)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
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

        {/* 저장 완료 메시지 */}
        {savedCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm text-center font-medium">
            {savedCount}건 저장 완료!
          </div>
        )}

        {/* 환자 행 목록 */}
        {rows.map((row, idx) => (
          <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
              {rows.length > 1 && (
                <button
                  onClick={() =>
                    setRows((prev) =>
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
              onChange={(e) => updateRow(row.id, { patient_name: e.target.value })}
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

            {/* 요금 종류 / 횟수 / 결제방식 / 금액 미리보기 (결석이 아닌 경우) */}
            {row.attendance !== 'absent' && (
              <>
              <RecordFormFields
                state={{
                  fee_type: row.fee_type,
                  unit_price: row.unit_price,
                  session_count: row.session_count,
                  payment_method: row.payment_method,
                  after_school_support: row.after_school_support,
                  payment_note: row.payment_note,
                }}
                feeTables={feeTables}
                total={row.total_amount}
                support={row.support_amount}
                selfPayment={row.self_payment}
                onChange={(updates) => updateRow(row.id, updates)}
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
                    <span>📷</span>
                    <span>영수증 사진 첨부</span>
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
          onClick={() => setRows((prev) => [...prev, newRow()])}
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
