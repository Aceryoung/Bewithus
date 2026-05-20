import type { PaymentMethod } from '@/types'

export const BRANCH_NAMES: Record<string, string> = {
  branch1: '1호점',
  branch2: '2호점',
}

export const ATTENDANCE_LABELS: Record<string, string> = {
  present: '출석',
  absent: '결석',
  makeup: '보강',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  education: '교육청',
  sports_voucher: '스포츠바우처',
  after_school: '방과후',
  card: '카드',
  cash: '현금',
}

// 월별 지원금 한도 (원)
export const MONTHLY_SUPPORT_LIMITS: Partial<Record<PaymentMethod, number>> = {
  education: 160000,
  sports_voucher: 130000,
  after_school: 120000,
}

// 세션 선택 옵션
export const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

// PIN 실패 잠금 설정
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCKOUT_SECONDS = 30
