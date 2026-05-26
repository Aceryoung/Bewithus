import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  suggestions: string[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function PatientInput({ value, suggestions, onChange, placeholder = '환자명 입력', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim().length > 0
    ? suggestions.filter((s) => s.includes(value.trim()) && s !== value.trim())
    : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value.replace(/[0-9]/g, '')); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 ${className}`}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 8).map((name) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(name); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-[#e8f7fb] transition-colors"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
