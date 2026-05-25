import type { PaymentMethod } from '@/types'
import { MONTHLY_SUPPORT_LIMITS } from '@/constants'

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

// "YYYY-MM-DD" 문자열을 로컬 날짜로 직접 파싱 (Date 객체 경유 시 UTC 오프셋 문제 방지)
export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y}.${m}.${d}`
}

// 로컬 날짜 기준 오늘 (ISO string은 UTC → 한국 자정 이전 어제 날짜 반환하는 버그 수정)
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function yearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-').map(Number)
  return { year: y, month: m }
}

// 지원금 계산: 이미 사용된 금액을 받아서 이번 건의 지원금과 자부담 반환
// afterSchoolOverride: 방과후 결제 시 지원금 직접입력 값 (undefined면 자동계산)
export function calcSupport(
  totalAmount: number,
  paymentMethod: PaymentMethod,
  usedSupportThisMonth: number,
  manualOverride?: number,
): { support: number; selfPayment: number } {
  // 방과후/스포츠바우처 직접입력이 있는 경우 override 우선 적용
  if ((paymentMethod === 'after_school' || paymentMethod === 'sports_voucher') && manualOverride !== undefined) {
    const support = Math.min(manualOverride, totalAmount)
    return { support, selfPayment: Math.max(0, totalAmount - support) }
  }

  const limit = MONTHLY_SUPPORT_LIMITS[paymentMethod]
  if (!limit) {
    return { support: 0, selfPayment: totalAmount }
  }
  const remaining = Math.max(0, limit - usedSupportThisMonth)
  const support = Math.min(totalAmount, remaining)
  const selfPayment = Math.max(0, totalAmount - support)
  return { support, selfPayment }
}

export function getWeekOfMonth(dateStr: string): number {
  const d = new Date(dateStr)
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  return Math.ceil((d.getDate() + firstDay) / 7)
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// 기록 한 줄에 표시할 결제 방식 레이블 (신형: 바우처명 포함)
export function paymentLabel(
  paymentMethod: string,
  paymentNote: string | null,
  secondaryMethod: string | null,
  tertiaryMethod: string | null,
  labels: Record<string, string>,
): string {
  const primary = paymentMethod === 'other' && paymentNote ? paymentNote : (labels[paymentMethod] ?? paymentMethod)
  const vouchers = [secondaryMethod, tertiaryMethod]
    .filter((m): m is string => !!m && m in labels)
    .map((m) => labels[m])
    .join('+')
  return vouchers ? `${primary} (${vouchers})` : primary
}
