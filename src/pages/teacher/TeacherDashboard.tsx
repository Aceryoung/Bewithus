import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW, formatDate } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import BottomNav from '@/components/ui/BottomNav'
import RecordEditSheet from '@/components/ui/RecordEditSheet'
import type { Record as SessionRecord } from '@/types'

interface Summary {
  total: number
  present: number
  absent: number
  makeup: number
  amount: number
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const today = todayStr()

  const [todayRecords, setTodayRecords] = useState<SessionRecord[]>([])
  const [monthSummary, setMonthSummary] = useState<Summary>({ total: 0, present: 0, absent: 0, makeup: 0, amount: 0 })
  const [loading, setLoading] = useState(true)
  const [editingRecord, setEditingRecord] = useState<SessionRecord | null>(null)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user) return
    setLoading(true)

    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [todayRes, monthRes] = await Promise.all([
      supabase.from('records').select('*').eq('teacher_id', user.id).eq('date', today).order('created_at', { ascending: false }),
      supabase.from('records').select('*').eq('teacher_id', user.id).gte('date', monthStart).lte('date', today),
    ])

    if (todayRes.data) setTodayRecords(todayRes.data as SessionRecord[])

    if (monthRes.data) {
      const records = monthRes.data as SessionRecord[]
      setMonthSummary({
        total: records.length,
        present: records.filter((r) => r.attendance === 'present').length,
        absent: records.filter((r) => r.attendance === 'absent').length,
        makeup: records.filter((r) => r.attendance === 'makeup').length,
        amount: records.reduce((acc, r) => acc + r.self_payment, 0),
      })
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">불러오는 중...</p>
        </div>
      </div>
    )
  }

  const statItems = [
    { label: '총건수', value: monthSummary.total, color: 'text-gray-800', bg: 'bg-gray-100' },
    { label: '출석', value: monthSummary.present, color: 'text-[#00b4d8]', bg: 'bg-[#e8f7fb]' },
    { label: '결석', value: monthSummary.absent, color: 'text-[#e85b8a]', bg: 'bg-[#fdeef5]' },
    { label: '보강', value: monthSummary.makeup, color: 'text-[#7db83a]', bg: 'bg-[#f0f9e8]' },
  ]

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-gray-900 text-2xl font-bold">{user?.name} 선생님</h1>
            <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full mt-1 active:bg-gray-200 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 space-y-3 pb-24 pt-3">
        {/* 건수 입력 CTA */}
        <button
          onClick={() => navigate('/teacher/input')}
          className="w-full py-5 bg-[#00b4d8] text-white rounded-2xl text-lg font-bold shadow-md shadow-[#00b4d8]/30 active:bg-[#0096b8] active:scale-[0.99] transition-all"
        >
          + 오늘 건수 입력하기
        </button>

        {/* 이달 요약 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">이달 건수 요약</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {statItems.map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl py-3 text-center`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2.5">
            <span className="text-sm text-slate-500">이달 자부담 합계</span>
            <span className="text-base font-bold text-slate-900">{formatKRW(monthSummary.amount)}</span>
          </div>
        </div>

        {/* 오늘 입력 내역 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-slate-700">오늘 입력 내역</h2>
            {todayRecords.length > 0 && (
              <span className="text-xs font-semibold text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-0.5 rounded-full">
                {todayRecords.length}건
              </span>
            )}
          </div>

          {todayRecords.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-slate-300 text-sm">오늘 입력된 건수가 없어요</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {todayRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 active:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      r.attendance === 'present' ? 'bg-[#00b4d8]' :
                      r.attendance === 'absent' ? 'bg-[#e85b8a]' : 'bg-[#7db83a]'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{r.patient_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회 · {PAYMENT_METHOD_LABELS[r.payment_method]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                      </p>
                      {r.support_amount > 0 && (
                        <p className="text-xs text-sky-500">지원 {formatKRW(r.support_amount)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingRecord(r)}
                      className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg active:bg-slate-200 transition-colors"
                    >
                      수정
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="h-2" />
        </div>
      </div>

      <BottomNav />

      {editingRecord && (
        <RecordEditSheet
          record={editingRecord}
          onSave={() => { setEditingRecord(null); loadData() }}
          onDelete={() => { setEditingRecord(null); loadData() }}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </div>
  )
}
