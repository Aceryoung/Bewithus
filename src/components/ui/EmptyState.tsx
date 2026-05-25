export default function EmptyState({ message = '데이터가 없습니다.' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-gray-300 text-sm">{message}</p>
    </div>
  )
}
