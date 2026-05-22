import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatKRW } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import { exportTeacherMonthly, exportAllTeachersMonthly } from '@/lib/excel'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { Record, User, PaymentMethod } from '@/types'

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

export default function DirectorMonthlyPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [records, setRecords] = useState<Record[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all')
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('users').select('*').eq('role', 'teacher').eq('is_active', true),
    ]).then(([b, u]) => {
      if (b.data) setBranches(b.data)
      if (u.data) setTeachers(u.data as User[])
    })
  }, [])

  useEffect(() => {
    loadRecords()
  }, [year, month, selectedBranch, selectedTeacher])

  const loadRecords = async () => {
    setLoading(true)
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    let query = supabase.from('records').select('*').gte('date', monthStart).lt('date', nextMonth)
    if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch)
    if (selectedTeacher !== 'all') query = query.eq('teacher_id', selectedTeacher)
    const { data } = await query.order('date', { ascending: false })
    if (data) setRecords(data as Record[])
    setLoading(false)
  }

  const filteredTeachers = selectedBranch === 'all'
    ? teachers
    : teachers.filter((t) => t.branch_id === selectedBranch)

  const visibleTeachers = selectedTeacher === 'all' ? filteredTeachers : filteredTeachers.filter((t) => t.id === selectedTeacher)

  const summaries: TeacherSummary[] = visibleTeachers.map((teacher) => {
    const tr = records.filter((r) => r.teacher_id === teacher.id)
    return {
      teacher,
      records: tr,
      totalCount: tr.length,
      presentCount: tr.filter((r) => r.attendance === 'present').length,
      absentCount: tr.filter((r) => r.attendance === 'absent').length,
      makeupCount: tr.filter((r) => r.attendance === 'makeup').length,
      totalAmount: tr.reduce((acc, r) => acc + r.total_amount, 0),
      supportAmount: tr.reduce((acc, r) => acc + r.support_amount, 0),
      selfPayment: tr.reduce((acc, r) => acc + r.self_payment, 0),
    }
  })

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
      <PageHeader title="월건수 확인" />

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 월 선택 + 전체 다운로드 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-3 py-3 shadow-sm flex-1">
            <button onClick={prevMonth} className="text-[#00b4d8] text-xl px-2">‹</button>
            <span className="font-bold text-gray-800">{year}년 {month}월</span>
            <button onClick={nextMonth} className="text-[#00b4d8] text-xl px-2">›</button>
          </div>
          <button
            onClick={() =>
              void exportAllTeachersMonthly(
                summaries.map((s) => ({ teacherName: s.teacher.name, records: s.records as import('@/types').Record[], year, month })),
                year, month,
              )
            }
            disabled={summaries.length === 0 || loading}
            className="flex items-center gap-1.5 bg-[#7db83a] text-white text-sm font-semibold px-3 py-3 rounded-xl shadow-sm active:bg-[#5f9428] disabled:opacity-40 transition-colors shrink-0"
          >
            <span>⬇</span>
            <span>전체</span>
          </button>
        </div>

        {/* 호점 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => { setSelectedBranch('all'); setSelectedTeacher('all') }}
            className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors ${selectedBranch === 'all' ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}>
            전체
          </button>
          {branches.map((b) => (
            <button key={b.id} onClick={() => { setSelectedBranch(b.id); setSelectedTeacher('all') }}
              className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors ${selectedBranch === b.id ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}>
              {b.name}
            </button>
          ))}
        </div>

        {/* 선생님 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setSelectedTeacher('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${selectedTeacher === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
            전체 선생님
          </button>
          {filteredTeachers.map((t) => (
            <button key={t.id} onClick={() => setSelectedTeacher(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${selectedTeacher === t.id ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-8">불러오는 중...</div>
        ) : (
          <>
            {summaries.map((s) => (
              <div key={s.teacher.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* 선생님 요약 행 (클릭 시 펼침) */}
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
                      onClick={() =>
                        void exportTeacherMonthly({
                          teacherName: s.teacher.name,
                          records: s.records as import('@/types').Record[],
                          year,
                          month,
                        })
                      }
                      className="flex items-center gap-1 text-xs text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-1.5 rounded-lg active:bg-[#d0eff7] transition-colors shrink-0 mt-0.5"
                    >
                      <span>⬇</span>
                      <span>엑셀</span>
                    </button>
                  </div>
                </div>

                {/* 상세 펼침 */}
                {expandedTeacher === s.teacher.id && (
                  <div className="border-t border-gray-100 px-4 pb-4">
                    {s.records.length === 0 ? (
                      <p className="text-xs text-gray-300 text-center py-4">기록이 없습니다.</p>
                    ) : (
                      s.records.map((r) => (
                        <div key={r.id} className="py-2 border-b border-gray-50 last:border-0 flex justify-between items-start">
                          <div>
                            <p className="text-sm text-gray-800">{r.patient_name}</p>
                            <p className="text-xs text-gray-400">
                              {r.date.slice(5)} · {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회
                              {' · '}{r.payment_method === 'other' && r.payment_note ? r.payment_note : PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod]}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}</p>
                            {r.support_amount > 0 && <p className="text-xs text-[#00b4d8]">{formatKRW(r.support_amount)}</p>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}

            {summaries.length === 0 && (
              <div className="text-center text-gray-300 py-12">데이터가 없습니다.</div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
