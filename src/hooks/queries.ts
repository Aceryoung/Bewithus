import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FeeTable, Record as SessionRecord, PaymentMethod } from '@/types'

// ── Query Key 팩토리 ─────────────────────────────────────────
export const qk = {
  feeTables: (branchId: string) => ['feeTables', branchId] as const,
  monthlyUsed: (teacherId: string, date: string) => ['monthlyUsed', teacherId, date] as const,
  todayRecords: (teacherId: string, today: string) => ['records', 'today', teacherId, today] as const,
  monthSummary: (teacherId: string, monthStart: string) => ['records', 'monthSummary', teacherId, monthStart] as const,
  monthlyRecords: (teacherId: string, year: number, month: number) =>
    ['records', 'monthly', teacherId, year, month] as const,
}

// ── 지점 요금표 ──────────────────────────────────────────────
export function useFeeTables(branchId: string | null) {
  return useQuery({
    queryKey: qk.feeTables(branchId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fee_tables')
        .select('*')
        .eq('branch_id', branchId!)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as FeeTable[]
    },
    enabled: !!branchId,
    staleTime: 1000 * 60 * 10, // 요금표는 자주 바뀌지 않음 → 10분
  })
}

// ── 이달 지원금 사용량 (DailyInputPage 금액 계산용) ───────────
export function useMonthlyUsed(teacherId: string | null, date: string) {
  return useQuery({
    queryKey: qk.monthlyUsed(teacherId ?? '', date),
    queryFn: async () => {
      const now = new Date(date)
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('records')
        .select('patient_name, payment_method, support_amount')
        .eq('teacher_id', teacherId!)
        .gte('date', monthStart)
        .lte('date', date)
      if (error) throw error

      const used: Record<string, Record<PaymentMethod, number>> = {}
      for (const r of data ?? []) {
        if (!used[r.patient_name]) {
          used[r.patient_name] = {
            education: 0, sports_voucher: 0, after_school: 0,
            card: 0, cash: 0, bank_transfer: 0, other: 0,
          }
        }
        used[r.patient_name][r.payment_method as PaymentMethod] += r.support_amount
      }
      return used
    },
    enabled: !!teacherId && !!date,
  })
}

// ── 오늘 기록 (TeacherDashboard) ────────────────────────────
export function useTodayRecords(teacherId: string | null, today: string) {
  return useQuery({
    queryKey: qk.todayRecords(teacherId ?? '', today),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('teacher_id', teacherId!)
        .eq('date', today)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionRecord[]
    },
    enabled: !!teacherId,
    staleTime: 1000 * 30, // 오늘 기록은 자주 바뀜 → 30초
  })
}

// ── 이달 요약 (TeacherDashboard) ────────────────────────────
export function useMonthSummary(teacherId: string | null, monthStart: string, today: string) {
  return useQuery({
    queryKey: qk.monthSummary(teacherId ?? '', monthStart),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('records')
        .select('attendance, self_payment')
        .eq('teacher_id', teacherId!)
        .gte('date', monthStart)
        .lte('date', today)
      if (error) throw error

      const records = data ?? []
      return {
        total: records.length,
        present: records.filter((r) => r.attendance === 'present').length,
        absent: records.filter((r) => r.attendance === 'absent').length,
        makeup: records.filter((r) => r.attendance === 'makeup').length,
        amount: records.reduce((acc, r) => acc + r.self_payment, 0),
      }
    },
    enabled: !!teacherId,
    staleTime: 1000 * 30,
  })
}

// ── 월별 기록 (MonthlyViewPage) ──────────────────────────────
export function useMonthlyRecords(teacherId: string | null, year: number, month: number) {
  return useQuery({
    queryKey: qk.monthlyRecords(teacherId ?? '', year, month),
    queryFn: async () => {
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
      const nextMonth = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('records')
        .select('*')
        .eq('teacher_id', teacherId!)
        .gte('date', monthStart)
        .lt('date', nextMonth)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionRecord[]
    },
    enabled: !!teacherId,
  })
}
