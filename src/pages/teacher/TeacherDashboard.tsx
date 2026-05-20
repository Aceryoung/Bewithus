import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatKRW } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import PageHeader from '@/components/ui/PageHeader'
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
      supabase
        .from('records')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('date', today)
        .order('created_at', { ascending: false }),
      supabase
        .from('records')
        .select('*')
        .eq('teacher_id', user.id)
        .gte('date', monthStart)
        .lte('date', today),
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
      <div className="flex items-center justify-center min-h-dvh">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title={`${user?.name} 선생님`} showLogout />

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 건수 입력 CTA */}
        <button
          onClick={() => navigate('/teacher/input')}
          className="w-full py-5 bg-blue-600 text-white rounded-2xl text-lg font-bold shadow-sm active:bg-blue-700 transition-colors"
        >
          + 오늘 건수 입력하기
        </button>

        {/* 이달 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">이달 건수 요약</h2>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: '총건수', value: monthSummary.total, color: 'text-gray-900' },
              { label: '출석', value: monthSummary.present, color: 'text-blue-600' },
              { label: '결석', value: monthSummary.absent, color: 'text-red-500' },
              { label: '보강', value: monthSummary.makeup, color: 'text-green-600' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
            <span className="text-sm text-gray-500">이달 자부담 합계</span>
            <span className="text-base font-bold text-gray-900">{formatKRW(monthSummary.amount)}</span>
          </div>
        </div>

        {/* 오늘 입력 내역 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-500">오늘 입력 내역</h2>
            <span className="text-xs text-gray-400">{todayRecords.length}건</span>
          </div>
          {todayRecords.length === 0 ? (
            <p className="text-center text-gray-300 py-6 text-sm">오늘 입력된 건수가 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {todayRecords.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{r.patient_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회
                      {' · '}{PAYMENT_METHOD_LABELS[r.payment_method]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                      </p>
                      {r.support_amount > 0 && (
                        <p className="text-xs text-blue-500">지원금 {formatKRW(r.support_amount)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingRecord(r)}
                      className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-lg active:bg-blue-100 transition-colors"
                    >
                      수정
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />

      {/* 기록 수정 바텀 시트 */}
      {editingRecord && (
        <RecordEditSheet
          record={editingRecord}
          onSave={() => {
            setEditingRecord(null)
            loadData()
          }}
          onDelete={() => {
            setEditingRecord(null)
            loadData()
          }}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </div>
  )
}
