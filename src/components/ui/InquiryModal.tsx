import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

interface Props {
  errorCode?: string
  onClose: () => void
}

export default function InquiryModal({ errorCode, onClose }: Props) {
  const user = useAuthStore((s) => s.user)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!user || !message.trim()) return
    setSending(true)
    await supabase.from('inquiries').insert({
      teacher_id: user.id,
      teacher_name: user.name,
      error_code: errorCode ?? null,
      message: message.trim(),
    })
    setSending(false)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <div className="text-center py-4 space-y-2">
              <p className="text-2xl">✓</p>
              <p className="font-bold text-gray-900">문의가 전송되었습니다</p>
              <p className="text-sm text-gray-400">대표가 확인 후 연락드립니다.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-[#00b4d8] text-white rounded-xl text-sm font-bold"
            >확인</button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900">문의하기</p>
              <button onClick={onClose} className="text-gray-300 text-xl px-1 leading-none">×</button>
            </div>

            {errorCode && (
              <div className="flex items-center gap-2 bg-red-50 rounded-xl px-4 py-2">
                <span className="text-xs text-gray-400">에러코드</span>
                <span className="font-bold text-red-500 tracking-widest text-sm">{errorCode}</span>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-400 mb-1.5">문의 내용</p>
              <textarea
                rows={4}
                placeholder="어떤 문제가 발생했는지 알려주세요."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#00b4d8] resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl text-sm"
              >취소</button>
              <button
                onClick={handleSubmit}
                disabled={sending || !message.trim()}
                className="flex-1 py-3 bg-[#00b4d8] text-white rounded-xl text-sm font-bold disabled:opacity-40"
              >{sending ? '전송 중…' : '전송'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
