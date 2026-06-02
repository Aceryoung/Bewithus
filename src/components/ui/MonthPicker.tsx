import { useState } from 'react'

interface Props {
  year: number
  month: number
  onSelect: (year: number, month: number) => void
  onClose: () => void
}

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function MonthPicker({ year, month, onSelect, onClose }: Props) {
  const [pickerYear, setPickerYear] = useState(year)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 연도 선택 */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setPickerYear((y) => y - 1)}
            className="w-8 h-8 flex items-center justify-center text-[#00b4d8] text-xl rounded-lg active:bg-gray-100"
          >‹</button>
          <span className="font-bold text-gray-900">{pickerYear}년</span>
          <button
            type="button"
            onClick={() => setPickerYear((y) => y + 1)}
            className="w-8 h-8 flex items-center justify-center text-[#00b4d8] text-xl rounded-lg active:bg-gray-100"
          >›</button>
        </div>

        {/* 월 그리드 */}
        <div className="grid grid-cols-4 gap-2">
          {MONTHS.map((label, i) => {
            const m = i + 1
            const isSelected = pickerYear === year && m === month
            return (
              <button
                key={m}
                type="button"
                onClick={() => { onSelect(pickerYear, m); onClose() }}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-colors
                  ${isSelected
                    ? 'bg-[#00b4d8] text-white'
                    : 'bg-gray-50 text-gray-700 active:bg-[#e8f7fb] active:text-[#00b4d8]'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
