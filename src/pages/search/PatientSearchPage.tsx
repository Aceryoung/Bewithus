import { useState, useEffect, useRef } from 'react'
import { usePatientSearch, type PatientSearchRecord } from '@/hooks/queries'
import { useAuthStore } from '@/store/auth'
import { formatKRW, formatDate, paymentLabel } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import { getReceiptSignedUrl } from '@/lib/storage'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import MonthPicker from '@/components/ui/MonthPicker'

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function todayYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function groupByPatient(records: PatientSearchRecord[]) {
  const map = new Map<string, PatientSearchRecord[]>()
  for (const r of records) {
    const key = r.patient_name
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return map
}

function calcTeacherCounts(records: PatientSearchRecord[]) {
  const map = new Map<string, { id: string; name: string; present: number; makeup: number; absent: number; sessionCount: number }>()
  for (const r of records) {
    if (r.attendance === 'payment') continue
    const tid = r.teacher.id
    if (!map.has(tid)) map.set(tid, { id: tid, name: r.teacher.name, present: 0, makeup: 0, absent: 0, sessionCount: 0 })
    const entry = map.get(tid)!
    if (r.attendance === 'present') { entry.present += 1; entry.sessionCount += Number(r.session_count ?? 1) }
    else if (r.attendance === 'makeup') { entry.makeup += 1; entry.sessionCount += Number(r.session_count ?? 1) }
    else if (r.attendance === 'absent') { entry.absent += 1 }
  }
  return [...map.values()]
}

function PatientCard({ patientName, records }: { patientName: string; records: PatientSearchRecord[] }) {
  const birthYear = records.find((r) => r.birth_year)?.birth_year
  const attendanceRecords = records.filter((r) => r.attendance !== 'payment')
  const paymentRecords = records.filter((r) => r.attendance === 'payment')
  const teacherCounts = calcTeacherCounts(records)
  const totalSessions = teacherCounts.reduce((s, t) => s + t.sessionCount, 0)

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#00b4d8]/10 flex items-center justify-center text-[#00b4d8] text-xs font-bold">
            {patientName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{patientName}</p>
            {birthYear && <p className="text-xs text-gray-400">{birthYear}년생</p>}
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">이달 참여</p>
            <p className="text-base font-bold text-[#00b4d8]">{totalSessions}회</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {teacherCounts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">선생님별 수업 현황</p>
            <div className="space-y-1.5">
              {teacherCounts.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00b4d8] shrink-0" />
                  <span className="text-sm font-medium text-gray-800 w-20 shrink-0">{t.name}</span>
                  <span className="text-sm font-bold text-[#00b4d8]">{t.sessionCount}회</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {[
                      t.present > 0 && `출석 ${t.present}`,
                      t.makeup > 0 && `보강 ${t.makeup}`,
                      t.absent > 0 && `결석 ${t.absent}`,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
              {teacherCounts.length > 1 && (
                <div className="flex items-center gap-2 pt-1 border-t border-dashed border-gray-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />
                  <span className="text-xs text-gray-400 w-20 shrink-0">합계</span>
                  <span className="text-xs font-bold text-gray-700">{totalSessions}회</span>
                </div>
              )}
            </div>
          </div>
        )}

        {attendanceRecords.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">수업 기록</p>
            <div className="space-y-1">
              {attendanceRecords.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-16 shrink-0">{formatDate(r.date)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0
                    ${r.attendance === 'present' ? 'bg-[#e8f7fb] text-[#00b4d8]' :
                      r.attendance === 'makeup'  ? 'bg-purple-50 text-purple-600' :
                      'bg-red-50 text-red-500'}`}>
                    {ATTENDANCE_LABELS[r.attendance]}
                  </span>
                  <span className="text-gray-500 shrink-0">{r.session_count}회</span>
                  <span className="text-gray-400 truncate">{r.teacher.name}</span>
                  {r.receipt_url && (
                    <button type="button" onClick={async () => { const url = await getReceiptSignedUrl(r.receipt_url!); if (url) window.open(url, '_blank') }} className="ml-auto text-[#00b4d8] shrink-0" title="영수증">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 1h5l3 3v7H2V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {paymentRecords.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">결제 내역</p>
            <div className="space-y-2">
              {paymentRecords.map((r) => (
                <div key={r.id} className="bg-gray-50 rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{formatDate(r.date)}</span>
                    <span className="text-xs text-gray-400">{r.teacher.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {paymentLabel(r.payment_method, r.payment_note, r.secondary_method, r.tertiary_method, PAYMENT_METHOD_LABELS)}
                    </span>
                    <span className="text-sm font-bold text-gray-900">{formatKRW(r.total_amount)}</span>
                  </div>
                  {(r.support_amount > 0 || r.secondary_support > 0 || r.tertiary_support > 0) && (
                    <div className="flex justify-between mt-1 text-xs text-gray-400">
                      <span>지원금 {formatKRW(r.support_amount + (r.secondary_support ?? 0) + (r.tertiary_support ?? 0))}</span>
                      <span className="font-medium text-gray-700">자부담 {formatKRW(r.self_payment)}</span>
                    </div>
                  )}
                  {r.receipt_url && (
                    <button type="button" onClick={async () => { const url = await getReceiptSignedUrl(r.receipt_url!); if (url) window.open(url, '_blank') }} className="mt-1 flex items-center gap-1 text-[10px] text-[#00b4d8]">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 1h5l3 3v7H2V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      영수증 보기
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {attendanceRecords.length === 0 && paymentRecords.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">해당 월에 기록이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

export default function PatientSearchPage() {
  const [query, setQuery] = useState('')
  const [yearMonth, setYearMonth] = useState(todayYearMonth)
  const [showPicker, setShowPicker] = useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const inputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)

  const pickerYear = Number(yearMonth.split('-')[0])
  const pickerMonth = Number(yearMonth.split('-')[1])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data: records = [], isFetching, isError } = usePatientSearch(debouncedQuery, yearMonth, user?.role, user?.branch_id)
  const grouped = groupByPatient(records)

  const displayYear = yearMonth.split('-')[0]
  const displayMonth = yearMonth.split('-')[1]

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <PageHeader title="환자 검색" />

      {/* 검색 바 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-[53px] lg:top-14 z-30">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#00b4d8] shrink-0">
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 12L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="환자 이름으로 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 text-sm outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
        />
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-xs font-medium text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-1.5 rounded-lg shrink-0 active:bg-[#d0eff7] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M4 1v2M10 1v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M1 6h12" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          {displayYear}.{displayMonth}
        </button>
      </div>

      {/* 월 표시 */}
      <div className="px-4 py-2 text-xs text-gray-400">
        {displayYear}년 {displayMonth}월 기록
      </div>

      {/* 결과 */}
      <div className="flex-1 px-4 pb-24 space-y-4 md:max-w-3xl md:mx-auto md:w-full">
        {debouncedQuery.trim().length === 1 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">한 글자 더 입력해주세요</p>
          </div>
        )}

        {debouncedQuery.trim().length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-3 text-gray-200">
              <circle cx="18" cy="18" r="12" stroke="currentColor" strokeWidth="2.5" />
              <path d="M27 27L36 36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm">두 글자 이상 입력하면 검색합니다</p>
          </div>
        )}

        {debouncedQuery.trim().length >= 2 && isFetching && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-[#00b4d8] border-t-transparent animate-spin" />
          </div>
        )}

        {debouncedQuery.trim().length >= 2 && !isFetching && isError && (
          <p className="text-center py-8 text-sm text-red-400">데이터를 불러오지 못했습니다.</p>
        )}

        {debouncedQuery.trim().length >= 2 && !isFetching && !isError && grouped.size === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">"{debouncedQuery}" 검색 결과가 없습니다.</p>
            <p className="text-xs mt-1">{displayYear}년 {displayMonth}월에 기록된 내역이 없어요.</p>
          </div>
        )}

        {[...grouped.entries()].map(([name, recs]) => (
          <PatientCard key={name} patientName={name} records={recs} />
        ))}
      </div>

      <BottomNav />

      {showPicker && (
        <MonthPicker
          year={pickerYear}
          month={pickerMonth}
          onSelect={(y, m) => setYearMonth(`${y}-${String(m).padStart(2, '0')}`)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
