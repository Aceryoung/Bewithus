import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { todayStr, formatKRW } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { Record, User, PaymentMethod } from '@/types'

export default function DirectorDailyPage() {
  const [date, setDate] = useState(todayStr())
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [records, setRecords] = useState<Record[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all')
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
  }, [date, selectedBranch, selectedTeacher])

  const loadRecords = async () => {
    setLoading(true)
    let query = supabase.from('records').select('*, teacher:teacher_id(id, name, branch_id)').eq('date', date)
    if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch)
    if (selectedTeacher !== 'all') query = query.eq('teacher_id', selectedTeacher)
    const { data } = await query.order('created_at', { ascending: false })
    if (data) setRecords(data as Record[])
    setLoading(false)
  }

  const filteredTeachers = selectedBranch === 'all'
    ? teachers
    : teachers.filter((t) => t.branch_id === selectedBranch)

  const totalCount = records.length
  const presentCount = records.filter((r) => r.attendance === 'present').length
  const absentCount = records.filter((r) => r.attendance === 'absent').length
  const makeupCount = records.filter((r) => r.attendance === 'makeup').length
  const totalAmount = records.reduce((acc, r) => acc + r.total_amount, 0)
  const supportAmount = records.reduce((acc, r) => acc + r.support_amount, 0)
  const selfPayment = records.reduce((acc, r) => acc + r.self_payment, 0)

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="일건수 확인" />

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 날짜 선택 */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-gray-500 shrink-0">날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 text-sm font-medium text-gray-900 outline-none bg-transparent"
          />
        </div>

        {/* 호점 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setSelectedBranch('all'); setSelectedTeacher('all') }}
            className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors
              ${selectedBranch === 'all' ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            전체
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => { setSelectedBranch(b.id); setSelectedTeacher('all') }}
              className={`px-4 py-2 rounded-full text-sm font-medium shrink-0 transition-colors
                ${selectedBranch === b.id ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* 선생님 필터 */}
        {filteredTeachers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedTeacher('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors
                ${selectedTeacher === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              전체 선생님
            </button>
            {filteredTeachers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeacher(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors
                  ${selectedTeacher === t.id ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* 일 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: '총건수', value: totalCount },
              { label: '출석', value: presentCount },
              { label: '결석', value: absentCount },
              { label: '보강', value: makeupCount },
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
              <span className="font-medium">{formatKRW(totalAmount)}</span>
            </div>
            {supportAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#00b4d8]">지원금</span>
                <span className="text-[#00b4d8]">{formatKRW(supportAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-700">자부담</span>
              <span>{formatKRW(selfPayment)}</span>
            </div>
          </div>
        </div>

        {/* 상세 내역 */}
        {loading ? (
          <div className="text-center text-gray-400 py-8">불러오는 중...</div>
        ) : records.length === 0 ? (
          <div className="text-center text-gray-300 py-12">해당 날짜의 기록이 없습니다.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            {records.map((r) => (
              <div key={r.id} className="py-2 border-b border-gray-50 last:border-0">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(r.teacher as unknown as User)?.name ?? '—'} · {ATTENDANCE_LABELS[r.attendance]}
                      {' · '}{r.fee_type} {r.session_count}회 · {r.payment_method === 'other' && r.payment_note ? r.payment_note : PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                    </p>
                    {r.support_amount > 0 && (
                      <p className="text-xs text-[#00b4d8]">지원금 {formatKRW(r.support_amount)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
