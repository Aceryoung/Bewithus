import { useState } from 'react'
import { APP_ERRORS } from '@/lib/appErrors'
import InquiryModal from '@/components/ui/InquiryModal'
import type { AppErrorCode } from '@/lib/appErrors'

interface Props {
  code: AppErrorCode
  detail?: string
  onClose: () => void
}

export default function ErrorModal({ code, detail, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [showInquiry, setShowInquiry] = useState(false)

  const copyCode = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (showInquiry) {
    return <InquiryModal errorCode={code} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">오류 발생</span>
          <button onClick={onClose} className="text-gray-300 text-xl px-1 leading-none">×</button>
        </div>

        <div className="bg-red-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-2xl font-bold text-red-500 tracking-widest">{code}</span>
          <button
            onClick={copyCode}
            className="text-xs text-red-400 bg-white border border-red-200 px-2.5 py-1 rounded-lg transition-colors active:bg-red-50 shrink-0"
          >
            {copied ? '복사됨 ✓' : '코드 복사'}
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-800">{APP_ERRORS[code]}</p>
          {detail && (
            <p className="text-xs text-gray-400 break-all">{detail}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold active:bg-gray-200 transition-colors"
          >
            닫기
          </button>
          <button
            onClick={() => setShowInquiry(true)}
            className="flex-1 py-3 bg-[#00b4d8] text-white rounded-xl text-sm font-bold active:bg-[#0096b8] transition-colors"
          >
            문의하기
          </button>
        </div>
      </div>
    </div>
  )
}
