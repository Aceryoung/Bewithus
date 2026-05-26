import InquiryModal from '@/components/ui/InquiryModal'
import type { AppErrorCode } from '@/lib/appErrors'

interface Props {
  code: AppErrorCode
  detail?: string
  onClose: () => void
}

export default function ErrorModal({ code, onClose }: Props) {
  return <InquiryModal errorCode={code} onClose={onClose} />
}
