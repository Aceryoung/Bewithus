import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import MonthPicker from '@/components/ui/MonthPicker'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, paymentLabel } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ErrorState from '@/components/ui/ErrorState'
import RecordEditSheet from '@/components/ui/RecordEditSheet'
import {
  useBranches, useDirectorUsers,
  useDirectorDailyRecords, useDirectorMonthlyRecords, usePendingMakeups,
  qk,
} from '@/hooks/queries'
import type { Record, User } from '@/types'

type ViewTab = 'daily' | 'monthly'

interface TeacherSummary {
  teacher: User
  records: Record[]
  totalCount: number
  presentCount: number
  absentCount: number
  makeupCount: number
  totalAmount: number
  supportAmount: number
  selfPayment: number
}

export default function DirectorRecordsPage() {
  const now = new Date()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canEdit = (teacherId: string) =>
    user?.role === 'director' || user?.role === 'admin' || user?.id === teacherId
  const [tab, setTab] = useState<ViewTab>('daily')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedTeacher, setSelectedTeacher] = useState('all')
  const [date, setDate] = useState(todayStr())
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const { data: branches = [] } = useBranches()
  const { data: allUsers = [] } = useDirectorUsers()
  const teachers = allUsers.filter((u) => u.role === 'teacher' || u.role === 'director')

  const { data: dailyRecords = [], isLoading: loadingDaily, error: errorDaily, refetch: refetchDaily } =
    useDirectorDailyRecords(date, selectedBranch, selectedTeacher)

  const { data: monthlyRecords = [], isLoading: loadingMonthly, error: errorMonthly, refetch: refetchMonthly } =
    useDirectorMonthlyRecords(year, month, selectedBranch, selectedTeacher)

  // 전체 다운용: 필터 상태와 무관하게 항상 전체 데이터
  const { data: allMonthlyRecords = [] } =
    useDirectorMonthlyRecords(year, month, 'all', 'all')

  const { data: pendingMakeups = {} } = usePendingMakeups()

  const isLoading = tab === 'daily' ? loadingDaily : loadingMonthly
  const error = tab === 'daily' ? errorDaily : errorMonthly
  const refetch = tab === 'daily' ? refetchDaily : refetchMonthly

  const filteredTeachers = selectedBranch === 'all' ? teachers : teachers.filter((t) => t.branch_id === selectedBranch)

  const switchTab = (t: ViewTab) => { setTab(t); setExpandedTeacher(null) }

  /* ── 일별 집계 ── */
  const dCountable = dailyRecords.filter((r) => r.attendance !== 'payment')
  const dSumSessions = (arr: typeof dailyRecords) => arr.reduce((acc, r) => acc + Number(r.session_count ?? 1), 0)
  const dTotal   = dSumSessions(dCountable)
  const dPresent = dSumSessions(dCountable.filter((r) => r.attendance === 'present'))
  const dAbsent  = dSumSessions(dCountable.filter((r) => r.attendance === 'absent'))
  const dMakeup  = dSumSessions(dCountable.filter((r) => r.attendance === 'makeup'))
  const dAmount  = dailyRecords.reduce((a, r) => a + r.total_amount, 0)
  const dSupport = dailyRecords.reduce((a, r) => a + r.support_amount, 0)
  const dSelf    = dailyRecords.reduce((a, r) => a + r.self_payment, 0)

  /* ── 월별 집계 ── */
  const visibleTeachers = selectedTeacher === 'all' ? filteredTeachers : filteredTeachers.filter((t) => t.id === selectedTeacher)

  const buildSummary = (recs: typeof monthlyRecords, teacher: User): TeacherSummary => {
    const tr = recs.filter((r) => r.teacher_id === teacher.id)
    const countable = tr.filter((r) => r.attendance !== 'payment')
    const sumSessions = (arr: typeof tr) => arr.reduce((acc, r) => acc + Number(r.session_count ?? 1), 0)
    return {
      teacher, records: tr,
      totalCount:    sumSessions(countable),
      presentCount:  sumSessions(countable.filter((r) => r.attendance === 'present')),
      absentCount:   sumSessions(countable.filter((r) => r.attendance === 'absent')),
      makeupCount:   sumSessions(countable.filter((r) => r.attendance === 'makeup')),
      totalAmount:   tr.reduce((a, r) => a + r.total_amount, 0),
      supportAmount: tr.reduce((a, r) => a + r.support_amount, 0),
      selfPayment:   tr.reduce((a, r) => a + r.self_payment, 0),
    }
  }

  const summaries: TeacherSummary[] = visibleTeachers.map((t) => buildSummary(monthlyRecords, t))
  const allTeacherSummaries: TeacherSummary[] = teachers.map((t) => buildSummary(allMonthlyRecords, t))

  const prevMonth = () => { if (month === 1) { setYear((y) => y - 1); setMonth(12) } else setMonth((m) => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear((y) => y + 1); setMonth(1) } else setMonth((m) => m + 1) }

  const handleRecordSaved = (updated: Record) => {
    queryClient.setQueryData(
      qk.directorDailyRecords(date, selectedBranch, selectedTeacher),
      (old: Record[] | undefined) => (old ?? []).map((r) => r.id === updated.id ? updated : r),
    )
    queryClient.setQueryData(
      qk.directorMonthlyRecords(year, month, selectedBranch, selectedTeacher),
      (old: Record[] | undefined) => (old ?? []).map((r) => r.id === updated.id ? updated : r),
    )
    setEditingRecord(null)
  }

  const handleRecordDeleted = (id: string) => {
    queryClient.setQueryData(
      qk.directorDailyRecords(date, selectedBranch, selectedTeacher),
      (old: Record[] | undefined) => (old ?? []).filter((r) => r.id !== id),
    )
    queryClient.setQueryData(
      qk.directorMonthlyRecords(year, month, selectedBranch, selectedTeacher),
      (old: Record[] | undefined) => (old ?? []).filter((r) => r.id !== id),
    )
    setEditingRecord(null)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <PageHeader title="건수 현황" />

      <div className="flex bg-white border-b border-gray-100 px-4 pt-2">
        {(['daily', 'monthly'] as ViewTab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2
              ${tab === t ? 'text-[#00b4d8] border-[#00b4d8]' : 'text-gray-400 border-transparent'}`}
          >
            {t === 'daily' ? '일별' : '월별'}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 pb-20 md:max-w-3xl md:mx-auto md:w-full">
        {/* 날짜 / 월 선택 */}
        {tab === 'daily' ? (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-500 shrink-0">날짜</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 text-sm font-medium text-gray-900 outline-none bg-transparent"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-3 py-3 shadow-sm flex-1">
              <button type="button" onClick={prevMonth} className="text-[#00b4d8] w-8 h-8 flex items-center justify-center rounded-lg active:bg-gray-100">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button type="button" onClick={() => setShowPicker(true)} className="font-bold text-gray-800 px-2 py-1 rounded-lg active:bg-gray-100">
                {year}년 {month}월 ▾
              </button>
              <button type="button" onClick={nextMonth} className="text-[#00b4d8] w-8 h-8 flex items-center justify-center rounded-lg active:bg-gray-100">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            {showPicker && (
              <MonthPicker
                year={year}
                month={month}
                onSelect={(y, m) => { setYear(y); setMonth(m) }}
                onClose={() => setShowPicker(false)}
              />
            )}
            <button
              onClick={() => void import('@/lib/excel').then(({ exportAllTeachersMonthly }) =>
                exportAllTeachersMonthly(
                  allTeacherSummaries.map((s) => ({
                    teacherName: s.teacher.name,
                    records: s.records as import('@/types').Record[],
                    pendingMakeups: pendingMakeups[s.teacher.id] ?? {},
                    branchName: branches.find((b) => b.id === s.teacher.branch_id)?.name,
                  })),
                  year, month,
                )
              )}
              disabled={allTeacherSummaries.length === 0 || isLoading}
              className="flex items-center gap-1.5 bg-[#7db83a] text-white text-sm font-semibold px-3 py-3 rounded-xl shadow-sm active:bg-[#5f9428] disabled:opacity-40 transition-colors shrink-0"
            >
              <span>전체 다운</span>
            </button>
          </div>
        )}

        {/* 호점 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setSelectedBranch('all'); setSelectedTeacher('all') }}
            className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors
              ${selectedBranch === 'all' ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
          >전체</button>
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => { setSelectedBranch(b.id); setSelectedTeacher('all') }}
              className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors
                ${selectedBranch === b.id ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
            >{b.name}</button>
          ))}
        </div>

        {/* 선생님 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedTeacher('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors
              ${selectedTeacher === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
          >전체 선생님</button>
          {filteredTeachers.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTeacher(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors
                ${selectedTeacher === t.id ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
            >{t.name}</button>
          ))}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            {/* ══ 일별 뷰 ══ */}
            {tab === 'daily' && (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: '총건수', value: dTotal },
                      { label: '출석',   value: dPresent },
                      { label: '결석',   value: dAbsent },
                      { label: '보강',   value: dMakeup },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-xl font-bold text-gray-900">{item.value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">총 청구액</span>
                      <span className="font-medium">{formatKRW(dAmount)}</span>
                    </div>
                    {dSupport > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#00b4d8]">지원금</span>
                        <span className="text-[#00b4d8]">{formatKRW(dSupport)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-gray-700">자부담</span>
                      <span>{formatKRW(dSelf)}</span>
                    </div>
                  </div>
                </div>

                {dailyRecords.length === 0 ? (
                  <div className="text-center text-gray-300 py-12">해당 날짜의 기록이 없습니다.</div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                    {dailyRecords.map((r) => (
                      <div key={r.id} className="py-2 border-b border-gray-50 last:border-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{r.patient_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(r.teacher as unknown as User)?.name ?? '—'} · {ATTENDANCE_LABELS[r.attendance]}
                              {' · '}{r.fee_type} {r.session_count}회
                              {' · '}{paymentLabel(r.payment_method, r.payment_note, r.secondary_method, r.tertiary_method, PAYMENT_METHOD_LABELS)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                              </p>
                              {r.support_amount > 0 && (
                                <p className="text-xs text-[#00b4d8]">지원금 {formatKRW(r.support_amount)}</p>
                              )}
                            </div>
                            {canEdit(r.teacher_id) && (
                              <button
                                onClick={() => setEditingRecord(r)}
                                className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-1 rounded-lg active:bg-[#d0eff7] transition-colors"
                              >수정</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ══ 월별 뷰 ══ */}
            {tab === 'monthly' && (
              <>
                {summaries.length === 0 ? (
                  <div className="text-center text-gray-300 py-12">데이터가 없습니다.</div>
                ) : (
                  summaries.map((s) => (
                    <div key={s.teacher.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => setExpandedTeacher(expandedTeacher === s.teacher.id ? null : s.teacher.id)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{s.teacher.name}</span>
                              <span className="text-gray-400 text-xs">{expandedTeacher === s.teacher.id ? '▲' : '▼'}</span>
                            </div>
                            <div className="flex gap-4 mt-1.5 text-sm">
                              <span className="text-gray-500">총 {s.totalCount}건</span>
                              <span className="text-[#00b4d8] font-semibold">{formatKRW(s.selfPayment)}</span>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-gray-400">
                              <span>출석 {s.presentCount}</span>
                              <span>결석 {s.absentCount}</span>
                              <span>보강 {s.makeupCount}</span>
                              {s.supportAmount > 0 && <span className="text-[#00b4d8]">지원금 {formatKRW(s.supportAmount)}</span>}
                            </div>
                          </button>
                          <button
                            onClick={() => void import('@/lib/excel').then(({ exportTeacherMonthly }) =>
                              exportTeacherMonthly({
                                teacherName: s.teacher.name,
                                records: s.records as import('@/types').Record[],
                                year, month,
                                pendingMakeups: pendingMakeups[s.teacher.id] ?? {},
                                branchName: branches.find((b) => b.id === s.teacher.branch_id)?.name,
                              })
                            )}
                            className="flex items-center gap-1 text-xs text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-1.5 rounded-lg active:bg-[#d0eff7] transition-colors shrink-0 mt-0.5"
                          >
                            <span>엑셀</span>
                          </button>
                        </div>
                      </div>

                      {expandedTeacher === s.teacher.id && (
                        <div className="border-t border-gray-100 px-4 pb-4">
                          {s.records.length === 0 ? (
                            <p className="text-xs text-gray-300 text-center py-4">기록이 없습니다.</p>
                          ) : (
                            s.records.map((r) => (
                              <div key={r.id} className="py-2 border-b border-gray-50 last:border-0 flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800">{r.patient_name}</p>
                                  <p className="text-xs text-gray-400">
                                    {r.date.slice(5)} · {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회
                                    {' · '}{paymentLabel(r.payment_method, r.payment_note, r.secondary_method, r.tertiary_method, PAYMENT_METHOD_LABELS)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <p className="text-sm font-medium">{r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}</p>
                                    {r.support_amount > 0 && <p className="text-xs text-[#00b4d8]">{formatKRW(r.support_amount)}</p>}
                                  </div>
                                  {r.receipt_url && (
                                    <button
                                      onClick={() => window.open(r.receipt_url!, '_blank')}
                                      className="text-sm text-gray-400 bg-gray-100 px-2 py-1 rounded-lg active:bg-gray-200 transition-colors"
                                      title="영수증 보기"
                                    >📷</button>
                                  )}
                                  {canEdit(r.teacher_id) && (
                                    <button
                                      onClick={() => setEditingRecord(r)}
                                      className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-1 rounded-lg active:bg-[#d0eff7] transition-colors"
                                    >수정</button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />

      {editingRecord && (
        <RecordEditSheet
          record={editingRecord}
          onSave={handleRecordSaved}
          onDelete={handleRecordDeleted}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </div>
  )
}
