import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS } from '@/constants'
import { uploadReceipt } from '@/lib/storage'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import RecordFormFields from '@/components/ui/RecordFormFields'
import SavedToast from '@/components/ui/SavedToast'
import type { Attendance, PaymentMethod, FeeTable } from '@/types'

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
  support_amount: number
  self_payment: number
  total_amount: number
  after_school_support?: number
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
    const dbUsed     = name ? (monthlyUsed[name]?.[row.payment_method] ?? 0) : 0
    const inFormUsed = name ? (inFormAccum[name][row.payment_method] ?? 0) : 0
    const total = row.unit_price * row.session_count
    const { support, selfPayment } = calcSupport(total, row.payment_method, dbUsed + inFormUsed, row.after_school_support)
    if (name) inFormAccum[name][row.payment_method] = (inFormAccum[name][row.payment_method] ?? 0) + support
    return { ...row, total_amount: total, support_amount: support, self_payment: selfPayment }
  })
}

const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

export default function PaymentPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<ActiveTab>('count')
  const [date, setDate] = useState(todayStr())

  /* 건수 탭 상태 */
  const [countRows, setCountRows] = useState<CountRow[]>([newCountRow()])
  const [savingCount, setSavingCount] = useState(false)
  const [savedCountN, setSavedCountN] = useState(0)

  /* 결제 탭 상태 */
  const [payRows, setPayRows] = useState<PayRow[]>([newPayRow()])
  const [feeTables, setFeeTables] = useState<FeeTable[]>([])
  const [monthlyUsed, setMonthlyUsed] = useState<Record<string, Record<PaymentMethod, number>>>({})
  const [savingPay, setSavingPay] = useState(false)
  const [savedPayN, setSavedPayN] = useState(0)

  useEffect(() => {
    if (!user?.branch_id) return
    supabase
      .from('fee_tables')
      .select('*')
      .eq('branch_id', user.branch_id)
      .eq('is_active', true)
      .then(({ data }: { data: FeeTable[] | null }) => { if (data) setFeeTables(data) })
  }, [user])

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
      .then(({ data }: { data: { patient_name: string; payment_method: string; support_amount: number }[] | null }) => {
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
        self_payment: 0,
        skip_amount: true,
      })),
    )
    setSavingCount(false)
    if (error) { alert(`저장 실패: ${error.message}`); return }
    setSavedCountN(valid.length)
    setCountRows([newCountRow()])
    setTimeout(() => setSavedCountN(0), 3000)
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

              {/* 횟수 */}
              <div>
                <p className="text-xs text-gray-400 mb-1.5">횟수</p>
                <div className="flex gap-1.5 flex-wrap">
                  {SESSION_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setCountRows((prev) => prev.map((r) => r.id === row.id ? { ...r, session_count: n } : r))}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors
                        ${row.session_count === n ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
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
                  payment_note: row.payment_note,
                }}
                feeTables={feeTables}
                total={row.total_amount}
                support={row.support_amount}
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
                    <span>📷</span>
                    <span>영수증 사진 첨부</span>
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
