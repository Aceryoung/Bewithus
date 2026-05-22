export type Role = 'director' | 'teacher'
export type BranchId = 'branch1' | 'branch2'
export type Attendance = 'present' | 'absent' | 'makeup'
export type PaymentMethod = 'education' | 'sports_voucher' | 'after_school' | 'card' | 'cash' | 'bank_transfer' | 'other'
export type MakeupStatus = 'pending' | 'completed'

export interface Branch {
  id: string
  name: string
  created_at: string
}

export interface User {
  id: string
  name: string
  role: Role
  branch_id: string | null
  is_active: boolean
  created_at: string
}

export interface FeeTable {
  id: string
  branch_id: string
  fee_type: string
  unit_price: number
}

export interface Record {
  id: string
  teacher_id: string
  branch_id: string
  date: string
  patient_name: string
  attendance: Attendance
  fee_type: string
  session_count: number
  unit_price: number
  total_amount: number
  payment_method: PaymentMethod
  support_amount: number
  self_payment: number
  receipt_url: string | null
  payment_note: string | null
  created_at: string
  updated_at: string
  teacher?: User
}

export interface MakeupSession {
  id: string
  teacher_id: string
  patient_name: string
  absent_date: string
  reason: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  status: MakeupStatus
  created_at: string
}

export interface DailySummary {
  total_count: number
  present_count: number
  absent_count: number
  makeup_count: number
  total_amount: number
  support_amount: number
  self_payment: number
}

export interface MonthlySummary {
  teacher_id: string
  teacher_name: string
  total_count: number
  present_count: number
  absent_count: number
  makeup_count: number
  total_amount: number
  support_amount: number
  self_payment: number
}

// AuthSession 제거: Supabase Auth JWT 세션으로 대체됨
