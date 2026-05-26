interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message = '데이터를 불러오지 못했습니다.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="bg-red-50 rounded-xl px-4 py-2 flex items-center gap-2">
        <span className="text-red-400 font-bold text-sm tracking-widest">ERR-201</span>
      </div>
      <p className="text-gray-400 text-sm text-center">{message}</p>
      <p className="text-xs text-gray-300">이 코드를 대표 또는 관리자에게 알려주세요.</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-[#00b4d8] bg-[#e8f7fb] px-4 py-2 rounded-lg active:bg-[#d0eff7] transition-colors"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
