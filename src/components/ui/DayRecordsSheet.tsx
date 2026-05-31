import { useNavigate } from 'react-router-dom'
import { ATTENDANCE_LABELS } from '@/constants'
import type { Record as SessionRecord } from '@/types'

interface Props {
  date: string
  records: SessionRecord[]
  role: 'teacher' | 'director'
  teacherNames?: Record<string, string>
  onClose: () => void
}

function RecordRow({ r }: { r: SessionRecord }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl
      ${r.attendance === 'present' ? 'bg-[#e8f7fb]' :
        r.attendance === 'absent'  ? 'bg-[#fde8f0]' :
        r.attendance === 'makeup'  ? 'bg-[#f0f9e8]' : 'bg-gray-50'}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0
          ${r.attendance === 'present' ? 'bg-[#00b4d8]' :
            r.attendance === 'absent'  ? 'bg-[#e85b8a]' :
            r.attendance === 'makeup'  ? 'bg-[#7db83a]' : 'bg-gray-300'}`}
        />
        <p className="text-sm font-medium text-gray-900 truncate">{r.patient_name}</p>
      </div>
      <p className="text-xs shrink-0 ml-2">
        <span className={
          r.attendance === 'present' ? 'text-[#00b4d8] font-medium' :
          r.attendance === 'absent'  ? 'text-[#e85b8a] font-medium' :
          r.attendance === 'makeup'  ? 'text-[#7db83a] font-medium' : 'text-gray-400'
        }>{ATTENDANCE_LABELS[r.attendance]}</span>
        {r.attendance !== 'absent' && (r.session_count ?? 0) > 0 && (
          <span className="text-gray-400"> · {r.session_count}회</span>
        )}
      </p>
    </div>
  )
}

export default function DayRecordsSheet({ date, records, role, teacherNames = {}, onClose }: Props) {
  const navigate = useNavigate()
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))

  // 대표: 선생님별 그룹
  const byTeacher = records.reduce<Record<string, SessionRecord[]>>((acc, r) => {
    if (!acc[r.teacher_id]) acc[r.teacher_id] = []
    acc[r.teacher_id].push(r)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-t-2xl max-h-[78dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex justify-between items-center px-4 py-3 shrink-0">
          <h2 className="font-bold text-gray-900">{month}월 {day}일 기록</h2>
          <button onClick={onClose} className="text-gray-400 text-xl px-1">×</button>
        </div>

        {/* 기록 목록 */}
        <div className="overflow-y-auto flex-1 px-4 pb-2">
          {records.length === 0 ? (
            <p className="text-gray-300 text-sm text-center py-10">기록이 없습니다</p>
          ) : role === 'teacher' ? (
            <div className="space-y-2">
              {records.map((r) => <RecordRow key={r.id} r={r} />)}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(byTeacher).map(([teacherId, teacherRecords]) => (
                <div key={teacherId}>
                  <p className="text-xs font-semibold text-gray-400 mb-1.5">
                    {teacherNames[teacherId] ?? '선생님'}
                  </p>
                  <div className="space-y-2">
                    {teacherRecords.map((r) => <RecordRow key={r.id} r={r} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 건수 입력 버튼 */}
        <div className="px-4 pt-2 pb-8 shrink-0 border-t border-gray-50">
          <button
            onClick={() => { navigate(role === 'director' ? '/director/payment' : '/teacher/payment'); onClose() }}
            className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-sm active:bg-[#0096b8] transition-colors"
          >
            + 건수 입력하기
          </button>
        </div>
      </div>
    </div>
  )
}
