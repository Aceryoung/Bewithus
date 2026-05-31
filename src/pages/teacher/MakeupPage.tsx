import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { todayStr, formatDate } from '@/lib/utils'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { MakeupSession } from '@/types'

export default function MakeupPage() {
  const user = useAuthStore((s) => s.user)
  const [sessions, setSessions] = useState<MakeupSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    patient_name: '',
    absent_date: todayStr(),
    reason: '',
    scheduled_date: '',
    scheduled_time: '',
  })

  const loadSessions = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('makeup_sessions')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setSessions(data as MakeupSession[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions()
  }, [loadSessions])

  const handleAdd = async () => {
    if (!user || !form.patient_name.trim()) return
    await supabase.from('makeup_sessions').insert({
      teacher_id: user.id,
      patient_name: form.patient_name.trim(),
      absent_date: form.absent_date,
      reason: form.reason || null,
      scheduled_date: form.scheduled_date || null,
      scheduled_time: form.scheduled_time || null,
      status: 'pending',
    })
    setShowForm(false)
    setForm({ patient_name: '', absent_date: todayStr(), reason: '', scheduled_date: '', scheduled_time: '' })
    loadSessions()
  }

  const handleComplete = async (id: string) => {
    await supabase.from('makeup_sessions').update({ status: 'completed' }).eq('id', id)
    loadSessions()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('makeup_sessions').delete().eq('id', id)
    loadSessions()
  }

  const pending = sessions.filter((s) => s.status === 'pending')
  const completed = sessions.filter((s) => s.status === 'completed')

  return (
    <div className="flex flex-col min-h-dvh pb-nav">
      <PageHeader title="보강 관리" />

      <div className="flex-1 px-4 py-4 space-y-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full py-3 bg-[#7db83a] text-white rounded-xl font-semibold active:bg-[#5f9428] transition-colors"
        >
          + 보강 추가
        </button>

        {/* 보강 추가 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">보강 정보 입력</h2>
            <input
              type="text"
              placeholder="환자명"
              value={form.patient_name}
              onChange={(e) => setForm((f) => ({ ...f, patient_name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">결석일</label>
                <input
                  type="date"
                  value={form.absent_date}
                  onChange={(e) => setForm((f) => ({ ...f, absent_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">보강 예정일</label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <input
              type="time"
              value={form.scheduled_time}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              placeholder="보강 예정 시간"
            />
            <input
              type="text"
              placeholder="사유 (선택)"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-500 text-sm"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={!form.patient_name.trim()}
                className="flex-1 py-2 bg-[#7db83a] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>
        )}

        {/* 대기 중 */}
        {pending.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">대기 중 ({pending.length})</h2>
            {pending.map((s) => (
              <div key={s.id} className="py-3 border-b border-gray-50 last:border-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="font-medium text-gray-900">{s.patient_name}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleComplete(s.id)}
                      className="text-xs text-[#7db83a] font-medium px-2 py-1 bg-[#f0f9e8] rounded"
                    >
                      완료
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-red-400 px-2 py-1"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  결석일: {formatDate(s.absent_date)}
                  {s.scheduled_date && ` → 보강: ${formatDate(s.scheduled_date)}${s.scheduled_time ? ` ${s.scheduled_time}` : ''}`}
                </p>
                {s.reason && <p className="text-xs text-gray-400 mt-0.5">사유: {s.reason}</p>}
              </div>
            ))}
          </div>
        )}

        {/* 완료 */}
        {completed.length > 0 && (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">완료 ({completed.length})</h2>
            {completed.map((s) => (
              <div key={s.id} className="py-2 border-b border-gray-100 last:border-0 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500 line-through">{s.patient_name}</p>
                  <p className="text-xs text-gray-300">결석일: {formatDate(s.absent_date)}</p>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-300 px-2">삭제</button>
              </div>
            ))}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center text-gray-300 py-12">보강 내역이 없습니다.</div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
