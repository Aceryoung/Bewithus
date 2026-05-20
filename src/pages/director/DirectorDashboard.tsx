import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatKRW, todayStr } from '@/lib/utils'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { User, Record as SessionRecord } from '@/types'

interface BranchStats {
  branch: { id: string; name: string }
  teachers: User[]
  totalCount: number
  presentCount: number
  totalAmount: number
  supportAmount: number
  selfPayment: number
  teacherStats: { teacher: User; count: number; amount: number }[]
}

export default function DirectorDashboard() {
  const [_branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState<BranchStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()

    // 실시간 구독
    const sub = supabase
      .channel('records_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => {
        loadData()
      })
      .subscribe()

    return () => { sub.unsubscribe() }
  }, [])

  const loadData = async () => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today = todayStr()

    const [branchRes, userRes, recordRes] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('users').select('*').eq('role', 'teacher').eq('is_active', true),
      supabase.from('records').select('*').gte('date', monthStart).lte('date', today),
    ])

    const branchList = (branchRes.data ?? []) as { id: string; name: string }[]
    const userList = (userRes.data ?? []) as User[]
    const recordList = (recordRes.data ?? []) as SessionRecord[]

    setBranches(branchList)

    const branchStats = branchList.map((branch) => {
      const branchTeachers = userList.filter((u) => u.branch_id === branch.id)
      const branchRecords = recordList.filter((r) => r.branch_id === branch.id)

      const teacherStats = branchTeachers.map((teacher) => {
        const tr = branchRecords.filter((r) => r.teacher_id === teacher.id)
        return {
          teacher,
          count: tr.length,
          amount: tr.reduce((acc, r) => acc + r.self_payment, 0),
        }
      }).sort((a, b) => b.count - a.count)

      return {
        branch,
        teachers: branchTeachers,
        totalCount: branchRecords.length,
        presentCount: branchRecords.filter((r) => r.attendance === 'present').length,
        totalAmount: branchRecords.reduce((acc, r) => acc + r.total_amount, 0),
        supportAmount: branchRecords.reduce((acc, r) => acc + r.support_amount, 0),
        selfPayment: branchRecords.reduce((acc, r) => acc + r.self_payment, 0),
        teacherStats,
      }
    })

    setStats(branchStats)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    )
  }

  const maxCount = Math.max(...stats.flatMap((s) => s.teacherStats.map((t) => t.count)), 1)

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="통합 대시보드" showLogout />

      <div className="flex-1 px-4 py-4 space-y-4">
        {stats.map((s) => (
          <div key={s.branch.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-base font-bold text-gray-900 mb-3">{s.branch.name}</h2>

            {/* 수치 요약 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: '이달 총건수', value: `${s.totalCount}건`, color: 'text-gray-900' },
                { label: '총 청구액', value: formatKRW(s.totalAmount), color: 'text-gray-900' },
                { label: '자부담 합계', value: formatKRW(s.selfPayment), color: 'text-blue-600' },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className={`text-sm font-bold ${item.color} truncate`}>{item.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            {/* 지원금 */}
            {s.supportAmount > 0 && (
              <div className="flex justify-between text-sm mb-4 px-1">
                <span className="text-gray-400">지원금 합계</span>
                <span className="text-blue-500 font-medium">{formatKRW(s.supportAmount)}</span>
              </div>
            )}

            {/* 선생님별 바 차트 */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">선생님별 이달 건수</p>
              {s.teacherStats.map(({ teacher, count, amount }) => (
                <div key={teacher.id}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-700">{teacher.name}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-900">{count}건</span>
                      <span className="text-xs text-gray-400 ml-2">{formatKRW(amount)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {s.teacherStats.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-2">등록된 선생님이 없습니다.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
