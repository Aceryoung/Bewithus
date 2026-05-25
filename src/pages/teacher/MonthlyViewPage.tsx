import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatKRW, getWeekOfMonth } from '@/lib/utils'
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

  const invalidate = () => {
    if (user) queryClient.invalidateQueries({ queryKey: qk.monthlyRecords(user.id, year, month) })
  }

  const totalCount = records.length
  const presentCount = records.filter((r) => r.attendance === 'present').length
  const absentCount = records.filter((r) => r.attendance === 'absent').length
  const makeupCount = records.filter((r) => r.attendance === 'makeup').length
  const totalAmount = records.reduce((acc, r) => acc + r.total_amount, 0)
  const totalSupport = records.reduce((acc, r) => acc + r.support_amount, 0)
  const totalSelf = records.reduce((acc, r) => acc + r.self_payment, 0)

  const byPayment: Partial<{ [K in PaymentMethod]: { amount: number; support: number; self: number } }> = {}
  for (const r of records) {
    if (!byPayment[r.payment_method]) {
      byPayment[r.payment_method] = { amount: 0, support: 0, self: 0 }
    }
    byPayment[r.payment_method]!.amount += r.total_amount
    byPayment[r.payment_method]!.support += r.support_amount
    byPayment[r.payment_method]!.self += r.self_payment
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

      <div className="flex-1 px-4 py-4 space-y-4">
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
                {(Object.entries(byPayment) as [PaymentMethod, { amount: number; support: number; self: number }][]).map(([method, data]) => (
                  <div key={method} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{PAYMENT_METHOD_LABELS[method]}</span>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatKRW(data.self)} <span className="text-xs text-gray-400">자부담</span></p>
                      {data.support > 0 && (
                        <p className="text-xs text-[#00b4d8]">지원금 {formatKRW(data.support)}</p>
                      )}
                    </div>
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
                            {' · '}{r.payment_method === 'other' && r.payment_note ? r.payment_note : PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod]}
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
          onSave={() => {
            setEditingRecord(null)
            invalidate()
          }}
          onDelete={() => {
            setEditingRecord(null)
            invalidate()
          }}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </div>
  )
}
