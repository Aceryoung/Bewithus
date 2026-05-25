interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message = '데이터를 불러오지 못했습니다.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-gray-400 text-sm">{message}</p>
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
