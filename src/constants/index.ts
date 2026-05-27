import type { PaymentMethod } from '@/types'

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
  bank_transfer: '계좌이체',
  other: '직접입력',
  developmental: '발달바우처',
  disabled_sports: '장애인스포츠',
  senior_voucher: '노인바우처',
  sci_rehab: 'SCI재활교실',
  after_school_fee: '방과후수강료',
}

// 월별 지원금 한도 (원) — 기본값 (2호점)
export const MONTHLY_SUPPORT_LIMITS: Partial<Record<PaymentMethod, number>> = {
  education: 160000,
  sports_voucher: 130000,
  after_school: 120000,
}

// 지점별 바우처 설정
export const BRANCH_VOUCHER_CONFIG: Record<string, {
  methods: PaymentMethod[]
  limits: Partial<Record<PaymentMethod, number>>
}> = {
  '1호점': {
    methods: ['developmental', 'sports_voucher', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'education', 'after_school_fee'],
    limits: {
      sports_voucher: 120000,
      disabled_sports: 110000,
    },
  },
  '2호점': {
    methods: ['education', 'sports_voucher', 'after_school'],
    limits: {
      education: 160000,
      sports_voucher: 130000,
      after_school: 120000,
    },
  },
}

// 세션 선택 옵션
export const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

// PIN 실패 잠금 설정
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCKOUT_SECONDS = 30

// 직급 목록
export const JOB_TITLE_OPTIONS = ['대표', '소장', '주임', '팀장', '사원', '연구원'] as const
