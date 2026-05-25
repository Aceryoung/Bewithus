export default function LoadingSpinner({ message = '불러오는 중...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-[#00b4d8] border-t-transparent animate-spin" />
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  )
}
