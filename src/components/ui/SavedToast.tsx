interface Props {
  count: number
}

export default function SavedToast({ count }: Props) {
  if (count === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-gray-900/90 text-white px-8 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-2 animate-fade-in">
        <p className="text-base font-bold">{count}건 저장 완료!</p>
      </div>
    </div>
  )
}
