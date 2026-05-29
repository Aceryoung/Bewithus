import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatKRW, getWeekOfMonth, paymentLabel } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import RecordEditSheet from '@/components/ui/RecordEditSheet'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ErrorState from '@/components/ui/ErrorState'
import { useMonthlyRecords, qk } from '@/hooks/queries'
import type { Record as SessionRecord, PaymentMethod } from '@/types'

export default function MonthlyViewPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [editingRecord, setEditingRecord] = useState<SessionRecord | null>(null)

  const { data: records = [], isLoading: loading, error, refetch } =
    useMonthlyRecords(user?.id ?? null, year, month)

  const handleRecordSaved = (updated: SessionRecord) => {
    if (!user) return
    queryClient.setQueryData(
      qk.monthlyRecords(user.id, year, month),
      (old: SessionRecord[] | undefined) =>
        (old ?? []).map((r) => r.id === updated.id ? updated : r),
    )
  }

  const handleRecordDeleted = (id: string) => {
    if (!user) return
    queryClient.setQueryData(
      qk.monthlyRecords(user.id, year, month),
      (old: SessionRecord[] | undefined) => (old ?? []).filter((r) => r.id !== id),
    )
  }

  const countable = records.filter((r) => r.attendance !== 'payment')
  const sumSessions = (arr: SessionRecord[]) => arr.reduce((acc, r) => acc + Number(r.session_count ?? 1), 0)
  const totalCount = sumSessions(countable)
  const presentCount = sumSessions(countable.filter((r) => r.attendance === 'present'))
  const absentCount = sumSessions(countable.filter((r) => r.attendance === 'absent'))
  const makeupCount = sumSessions(countable.filter((r) => r.attendance === 'makeup'))
  const totalAmount = records.reduce((acc, r) => acc + r.total_amount, 0)
  const totalSupport = records.reduce((acc, r) => acc + r.support_amount, 0)
  const totalSelf = records.reduce((acc, r) => acc + r.self_payment, 0)

  // 결제방식별: primary는 total/self 집계, 바우처별로 support 별도 집계
  const byPayment: Partial<{ [K in PaymentMethod]: { amount: number; support: number; self: number } }> = {
    card: { amount: 0, support: 0, self: 0 },
    cash: { amount: 0, support: 0, self: 0 },
    bank_transfer: { amount: 0, support: 0, self: 0 },
  }
  const byVoucher: Partial<{ [K in PaymentMethod]: number }> = {}
  for (const r of records) {
    if (!byPayment[r.payment_method]) {
      byPayment[r.payment_method] = { amount: 0, support: 0, self: 0 }
    }
    byPayment[r.payment_method]!.amount += r.total_amount
    byPayment[r.payment_method]!.self += r.self_payment
    // 지원금은 바우처별로 집계
    if (r.secondary_method) byVoucher[r.secondary_method as PaymentMethod] = (byVoucher[r.secondary_method as PaymentMethod] ?? 0) + r.secondary_support
    if (r.tertiary_method)  byVoucher[r.tertiary_method as PaymentMethod]  = (byVoucher[r.tertiary_method  as PaymentMethod] ?? 0) + (r.tertiary_support ?? 0)
    // 구형 기록 (payment_method가 바우처 타입)
    const VOUCHERS = new Set(['education', 'sports_voucher', 'after_school'])
    if (VOUCHERS.has(r.payment_method)) {
      byVoucher[r.payment_method] = (byVoucher[r.payment_method] ?? 0) + r.support_amount - r.secondary_support
    }
  }

  const byWeek: { [week: number]: SessionRecord[] } = {}
  for (const r of records) {
    const w = getWeekOfMonth(r.date)
    if (!byWeek[w]) byWeek[w] = []
    byWeek[w].push(r)
  }

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="월별 건수" />

      <div className="flex-1 px-4 py-4 space-y-4 md:max-w-3xl md:mx-auto md:w-full">
        {/* 월 선택 */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
          <button onClick={prevMonth} className="text-[#00b4d8] text-xl px-2">‹</button>
          <span className="font-semibold text-gray-800">{year}년 {month}월</span>
          <button onClick={nextMonth} className="text-[#00b4d8] text-xl px-2">›</button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            {/* 월 요약 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-500 mb-3">이달 요약</h2>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: '총건수', value: totalCount, color: 'text-gray-900' },
                  { label: '출석', value: presentCount, color: 'text-[#00b4d8]' },
                  { label: '결석', value: absentCount, color: 'text-[#e85b8a]' },
                  { label: '보강', value: makeupCount, color: 'text-[#7db83a]' },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">총 청구액</span>
                  <span className="font-medium">{formatKRW(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#00b4d8]">지원금</span>
                  <span className="text-[#00b4d8]">{formatKRW(totalSupport)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">자부담</span>
                  <span>{formatKRW(totalSelf)}</span>
                </div>
              </div>
            </div>

            {/* 결제방식별 */}
            {Object.keys(byPayment).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">결제방식별 금액</h2>
                {(Object.entries(byPayment) as [PaymentMethod, { amount: number; self: number }][]).map(([method, data]) => (
                  <div key={method} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{PAYMENT_METHOD_LABELS[method] ?? method}</span>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatKRW(data.self)} <span className="text-xs text-gray-400">자부담</span></p>
                    </div>
                  </div>
                ))}
                {(Object.entries(byVoucher) as [PaymentMethod, number][]).filter(([, v]) => v > 0).map(([method, amount]) => (
                  <div key={`v-${method}`} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-[#7db83a]">{PAYMENT_METHOD_LABELS[method] ?? method} 지원금</span>
                    <p className="text-sm text-[#7db83a]">{formatKRW(amount)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 주차별 상세 */}
            {Object.entries(byWeek)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([week, weekRecords]: [string, SessionRecord[]]) => (
                <div key={week} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-500 mb-3">{week}주차</h2>
                  {weekRecords.map((r) => (
                    <div key={r.id} className="py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{r.patient_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.date.slice(5)} · {ATTENDANCE_LABELS[r.attendance]}
                            {' · '}{r.fee_type} {r.session_count}회
                            {' · '}{paymentLabel(r.payment_method, r.payment_note, r.secondary_method, r.tertiary_method, PAYMENT_METHOD_LABELS)}
                            {r.updated_by_name && <span className="text-orange-400"> · 수정: {r.updated_by_name}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                            </p>
                            {r.support_amount > 0 && (
                              <p className="text-xs text-[#00b4d8]">지원금 {formatKRW(r.support_amount)}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setEditingRecord(r)}
                            className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-2 py-1 rounded-lg active:bg-[#d0eff7] transition-colors"
                          >
                            수정
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

            {records.length === 0 && (
              <div className="text-center text-gray-300 py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">이달 기록이 없습니다.</div>
            )}
          </>
        )}
      </div>

      <BottomNav />

      {/* 기록 수정 바텀 시트 */}
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
