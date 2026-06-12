import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ErrorState from '@/components/ui/ErrorState'
import { useInquiries } from '@/hooks/queries'
import { APP_ERRORS } from '@/lib/appErrors'
import type { Inquiry } from '@/types'

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default function InquiryPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { data: inquiries = [], isLoading, error, refetch } = useInquiries()

  const markRead = async (inquiry: Inquiry) => {
    if (inquiry.is_read) return
    await supabase.from('inquiries').update({ is_read: true }).eq('id', inquiry.id)
    queryClient.setQueryData(['inquiries'], (old: Inquiry[] | undefined) =>
      (old ?? []).map((i) => i.id === inquiry.id ? { ...i, is_read: true } : i)
    )
    queryClient.setQueryData(['inquiries', 'unread'], (old: number | undefined) =>
      Math.max(0, (old ?? 1) - 1)
    )
  }

  const markAllRead = async () => {
    const unread = inquiries.filter((i) => !i.is_read)
    if (unread.length === 0) return
    await supabase.from('inquiries').update({ is_read: true }).eq('is_read', false)
    queryClient.setQueryData(['inquiries'], (old: Inquiry[] | undefined) =>
      (old ?? []).map((i) => ({ ...i, is_read: true }))
    )
    queryClient.setQueryData(['inquiries', 'unread'], 0)
  }

  const markResolved = async (e: React.MouseEvent, inquiry: Inquiry) => {
    e.stopPropagation()
    await supabase.from('inquiries').update({ is_resolved: true }).eq('id', inquiry.id)
    queryClient.setQueryData(['inquiries'], (old: Inquiry[] | undefined) =>
      (old ?? []).map((i) => i.id === inquiry.id ? { ...i, is_resolved: true } : i)
    )
  }

  const unreadCount = inquiries.filter((i) => !i.is_read).length
  const pending = inquiries.filter((i) => !i.is_resolved)
  const resolved = inquiries.filter((i) => i.is_resolved)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <PageHeader title="문의함" showSearch />

      <div className="flex-1 px-4 py-4 space-y-3 pb-20 md:max-w-3xl md:mx-auto md:w-full">
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            {unreadCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">미확인 {unreadCount}건</span>
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-3 py-1.5 rounded-lg active:bg-[#d0eff7] transition-colors"
                >
                  모두 읽음
                </button>
              </div>
            )}

            {inquiries.length === 0 ? (
              <div className="text-center text-gray-300 py-16">문의가 없습니다.</div>
            ) : (
              <>
                {/* 미처리 문의 */}
                {pending.map((inquiry) => (
                  <div
                    key={inquiry.id}
                    onClick={() => void markRead(inquiry)}
                    className={`bg-white rounded-2xl border shadow-sm p-4 space-y-2 cursor-pointer transition-colors
                      ${inquiry.is_read ? 'border-gray-100' : 'border-[#00b4d8]/30 bg-[#f0fbfd]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {!inquiry.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#00b4d8] shrink-0" />
                        )}
                        <span className="font-semibold text-gray-900 text-sm">{inquiry.teacher_name}</span>
                        {inquiry.error_code && (
                          <span className="text-xs font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">
                            {inquiry.error_code}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(inquiry.created_at)}</span>
                    </div>
                    {inquiry.error_code && APP_ERRORS[inquiry.error_code as keyof typeof APP_ERRORS] && (
                      <p className="text-xs text-red-400">{APP_ERRORS[inquiry.error_code as keyof typeof APP_ERRORS]}</p>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{inquiry.message}</p>
                    {isAdmin && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={(e) => void markResolved(e, inquiry)}
                          className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg active:bg-emerald-100 transition-colors font-medium"
                        >
                          조치완료
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* 조치완료 문의 */}
                {resolved.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 pt-2">조치완료</p>
                    {resolved.map((inquiry) => (
                      <div
                        key={inquiry.id}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-700 text-sm">{inquiry.teacher_name}</span>
                            {inquiry.error_code && (
                              <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                {inquiry.error_code}
                              </span>
                            )}
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">완료</span>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{timeAgo(inquiry.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">{inquiry.message}</p>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
