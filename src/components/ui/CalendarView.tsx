import type { Record as SessionRecord } from '@/types'

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  year: number
  month: number
  records: SessionRecord[]
  onDateSelect: (date: string) => void
  onMonthChange: (year: number, month: number) => void
}

export default function CalendarView({ year, month, records, onDateSelect, onMonthChange }: Props) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 날짜별 출석 통계
  const stats: Record<string, { presentCount: number; hasAbsent: boolean; hasMakeup: boolean; hasPayment: boolean }> = {}
  for (const r of records) {
    if (!stats[r.date]) stats[r.date] = { presentCount: 0, hasAbsent: false, hasMakeup: false, hasPayment: false }
    if (r.attendance === 'present')      stats[r.date].presentCount += Number(r.session_count ?? 1)
    else if (r.attendance === 'absent')  stats[r.date].hasAbsent = true
    else if (r.attendance === 'makeup')  stats[r.date].hasMakeup = true
    else if (r.attendance === 'payment') stats[r.date].hasPayment = true
  }

  // 달력 그리드: 앞 빈칸 + 날짜
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => month === 1 ? onMonthChange(year - 1, 12) : onMonthChange(year, month - 1)
  const nextMonth = () => month === 12 ? onMonthChange(year + 1, 1) : onMonthChange(year, month + 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-[#00b4d8] text-xl px-2 py-1 active:opacity-60">‹</button>
        <span className="font-semibold text-gray-800">{year}년 {month}월</span>
        <button onClick={nextMonth} className="text-[#00b4d8] text-xl px-2 py-1 active:opacity-60">›</button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <p key={d} className={`text-center text-[11px] font-medium pb-1
            ${i === 0 ? 'text-[#e85b8a]' : i === 6 ? 'text-[#00b4d8]' : 'text-gray-400'}`}>
            {d}
          </p>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} />
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const s = stats[dateStr]
          const isToday = dateStr === todayStr
          const colIndex = idx % 7

          return (
            <button
              key={dateStr}
              onClick={() => s ? onDateSelect(dateStr) : undefined}
              className={`flex flex-col items-center justify-start pt-1.5 pb-1 rounded-xl min-h-[48px] transition-colors
                ${isToday ? 'bg-[#00b4d8]' : s ? 'active:bg-gray-100' : 'cursor-default'}`}
            >
              <span className={`text-xs font-semibold leading-none
                ${isToday ? 'text-white' :
                  colIndex === 0 ? 'text-[#e85b8a]' :
                  colIndex === 6 ? 'text-[#00b4d8]' :
                  'text-gray-700'}`}>
                {day}
              </span>
              {s && (
                <div className="flex flex-col items-center mt-0.5 gap-0.5">
                  {s.presentCount > 0 && (
                    <span className={`text-[10px] font-bold leading-none ${isToday ? 'text-white' : 'text-[#00b4d8]'}`}>
                      {s.presentCount}
                    </span>
                  )}
                  <div className="flex gap-0.5">
                    {s.hasAbsent  && <span className="w-1 h-1 rounded-full bg-[#e85b8a] shrink-0" />}
                    {s.hasMakeup  && <span className="w-1 h-1 rounded-full bg-[#7db83a] shrink-0" />}
                    {s.hasPayment && <span className="w-1 h-1 rounded-full bg-[#00b4d8] shrink-0" />}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-[#00b4d8]">숫자</span>
          <span className="text-[10px] text-gray-400">출석</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e85b8a]" />
          <span className="text-[10px] text-gray-400">결석</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7db83a]" />
          <span className="text-[10px] text-gray-400">보강</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00b4d8]" />
          <span className="text-[10px] text-gray-400">결제</span>
        </div>
      </div>
    </div>
  )
}
