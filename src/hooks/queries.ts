import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BranchVoucherConfig, FeeTable, Record as SessionRecord, User, PaymentMethod } from '@/types'

// ── Query Key 팩토리 ─────────────────────────────────────────
export const qk = {
  // teacher
  feeTables: (branchId: string) => ['feeTables', branchId] as const,
  monthlyUsed: (teacherId: string, date: string) => ['monthlyUsed', teacherId, date] as const,
  todayRecords: (teacherId: string, today: string) => ['records', 'today', teacherId, today] as const,
  monthSummary: (teacherId: string, monthStart: string) => ['records', 'monthSummary', teacherId, monthStart] as const,
  monthlyRecords: (teacherId: string, year: number, month: number) =>
    ['records', 'monthly', teacherId, year, month] as const,
  // director – static
  branches: () => ['branches'] as const,
  directorUsers: () => ['users', 'director'] as const,
  // director – dynamic
  directorDashboard: (monthStart: string, today: string) =>
    ['director', 'dashboard', monthStart, today] as const,
  directorDailyRecords: (date: string, branchId: string, teacherId: string) =>
    ['director', 'daily', date, branchId, teacherId] as const,
  directorMonthlyRecords: (year: number, month: number, branchId: string, teacherId: string) =>
    ['director', 'monthly', year, month, branchId, teacherId] as const,
  pendingMakeups: () => ['makeupSessions', 'pending'] as const,
  accountsData: (monthStart: string, today: string) =>
    ['director', 'accounts', monthStart, today] as const,
  voucherConfig: (branchId: string) => ['voucherConfig', branchId] as const,
  allVoucherConfigs: () => ['voucherConfig', 'all'] as const,
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

// ── 이달 지원금 사용량 (PaymentPage 금액 계산용) ────────────
export function useMonthlyUsed(teacherId: string | null, date: string) {
  return useQuery({
    queryKey: qk.monthlyUsed(teacherId ?? '', date),
    queryFn: async () => {
      const now = new Date(date)
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('records')
        .select('patient_name, payment_method, support_amount, secondary_method, secondary_support, tertiary_method, tertiary_support')
        .eq('teacher_id', teacherId!)
        .gte('date', monthStart)
        .lte('date', date)
      if (error) throw error

      const voucherTypes = new Set<string>([
        'education', 'sports_voucher', 'after_school',
        'developmental', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'after_school_fee',
      ])
      const used: Record<string, Record<PaymentMethod, number>> = {}
      for (const r of data ?? []) {
        const name = r.patient_name
        if (!used[name]) {
          used[name] = {
            education: 0, sports_voucher: 0, after_school: 0,
            card: 0, cash: 0, bank_transfer: 0, other: 0,
            developmental: 0, disabled_sports: 0, senior_voucher: 0, sci_rehab: 0, after_school_fee: 0,
          }
        }
        const secSupport = r.secondary_support ?? 0
        const terSupport = r.tertiary_support ?? 0
        if (voucherTypes.has(r.payment_method)) {
          used[name][r.payment_method as PaymentMethod] += Math.max(0, r.support_amount - secSupport)
        }
        if (r.secondary_method && voucherTypes.has(r.secondary_method)) {
          used[name][r.secondary_method as PaymentMethod] += secSupport
        }
        if (r.tertiary_method && voucherTypes.has(r.tertiary_method)) {
          used[name][r.tertiary_method as PaymentMethod] += terSupport
        }
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
        .select('attendance, self_payment, total_amount')
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
        amount: records.reduce((acc, r) => acc + r.total_amount, 0),
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

// ── 지점 목록 (director 공통) ────────────────────────────────
export function useBranches() {
  return useQuery({
    queryKey: qk.branches(),
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
    staleTime: 1000 * 60 * 10,
  })
}

// ── 사용자 목록 (director 공통 — teacher+director+admin) ─────
export function useDirectorUsers() {
  return useQuery({
    queryKey: qk.directorUsers(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('role', ['teacher', 'director', 'admin'])
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as User[]
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── DirectorDashboard: 이달 전체 통계용 원시 데이터 ──────────
export function useDirectorDashboard(monthStart: string, today: string) {
  return useQuery({
    queryKey: qk.directorDashboard(monthStart, today),
    queryFn: async () => {
      const [branchRes, userRes, recordRes] = await Promise.all([
        supabase.from('branches').select('id, name'),
        supabase.from('users').select('*').in('role', ['teacher', 'director']).eq('is_active', true),
        supabase.from('records').select('*').gte('date', monthStart).lte('date', today),
      ])
      if (branchRes.error) throw branchRes.error
      if (userRes.error) throw userRes.error
      if (recordRes.error) throw recordRes.error
      return {
        branches: (branchRes.data ?? []) as { id: string; name: string }[],
        users: (userRes.data ?? []) as User[],
        records: (recordRes.data ?? []) as SessionRecord[],
      }
    },
    staleTime: 1000 * 30,
  })
}

// ── 대표 일별 기록 ────────────────────────────────────────────
export function useDirectorDailyRecords(date: string, branchId: string, teacherId: string) {
  return useQuery({
    queryKey: qk.directorDailyRecords(date, branchId, teacherId),
    queryFn: async () => {
      let query = supabase
        .from('records')
        .select('*, teacher:teacher_id(id, name, branch_id)')
        .eq('date', date)
      if (branchId !== 'all') query = query.eq('branch_id', branchId)
      if (teacherId !== 'all') query = query.eq('teacher_id', teacherId)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionRecord[]
    },
    staleTime: 1000 * 30,
  })
}

// ── 대표 월별 기록 ────────────────────────────────────────────
export function useDirectorMonthlyRecords(
  year: number, month: number, branchId: string, teacherId: string,
) {
  return useQuery({
    queryKey: qk.directorMonthlyRecords(year, month, branchId, teacherId),
    queryFn: async () => {
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
      const nextM = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
      let query = supabase.from('records').select('*').gte('date', monthStart).lt('date', nextM)
      if (branchId !== 'all') query = query.eq('branch_id', branchId)
      if (teacherId !== 'all') query = query.eq('teacher_id', teacherId)
      const { data, error } = await query.order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionRecord[]
    },
    staleTime: 1000 * 60,
  })
}

// ── 미완료 보강 (DirectorRecordsPage 월별 탭) ────────────────
export function usePendingMakeups() {
  return useQuery({
    queryKey: qk.pendingMakeups(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('makeup_sessions')
        .select('teacher_id, patient_name')
        .eq('status', 'pending')
      if (error) throw error
      const map: { [tid: string]: { [name: string]: number } } = {}
      for (const m of (data ?? []) as { teacher_id: string; patient_name: string }[]) {
        if (!map[m.teacher_id]) map[m.teacher_id] = {}
        map[m.teacher_id][m.patient_name] = (map[m.teacher_id][m.patient_name] ?? 0) + 1
      }
      return map
    },
    staleTime: 1000 * 60,
  })
}

// ── 문의함 ────────────────────────────────────────────────────
export function useInquiries() {
  return useQuery({
    queryKey: ['inquiries'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as import('@/types').Inquiry[]
    },
    staleTime: 1000 * 30,
  })
}

export function useUnreadInquiryCount() {
  return useQuery({
    queryKey: ['inquiries', 'unread'] as const,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 1000 * 30,
  })
}

// ── 최근 환자 이름 목록 (자동완성용) ─────────────────────────
export function useRecentPatients(teacherId: string | null) {
  return useQuery({
    queryKey: ['recentPatients', teacherId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('records')
        .select('patient_name')
        .eq('teacher_id', teacherId!)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const seen = new Set<string>()
      for (const r of data ?? []) seen.add(r.patient_name)
      return [...seen]
    },
    enabled: !!teacherId,
    staleTime: 1000 * 60 * 5,
  })
}

// ── 지점별 지원금(바우처) 설정 ────────────────────────────────
export function useBranchVoucherConfig(branchId: string | null) {
  return useQuery({
    queryKey: qk.voucherConfig(branchId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branch_voucher_config')
        .select('*')
        .eq('branch_id', branchId!)
        .eq('is_active', true)
        .order('payment_method')
      if (error) throw error
      return (data ?? []) as BranchVoucherConfig[]
    },
    enabled: !!branchId,
    staleTime: 1000 * 60 * 10,
  })
}

// ── AccountsPage 데이터 ───────────────────────────────────────
export function useAccountsData(monthStart: string, today: string) {
  return useQuery({
    queryKey: qk.accountsData(monthStart, today),
    queryFn: async () => {
      const [branchRes, userRes, recordRes, feeRes, voucherRes] = await Promise.all([
        supabase.from('branches').select('id, name'),
        supabase.from('users').select('*').in('role', ['teacher', 'admin', 'director']).order('name'),
        supabase.from('records').select('teacher_id, total_amount, self_payment').gte('date', monthStart).lte('date', today),
        supabase.from('fee_tables').select('*').eq('is_active', true).order('fee_type'),
        supabase.from('branch_voucher_config').select('*').eq('is_active', true).order('payment_method'),
      ])
      if (branchRes.error) throw branchRes.error
      if (userRes.error) throw userRes.error
      if (recordRes.error) throw recordRes.error
      if (feeRes.error) throw feeRes.error
      if (voucherRes.error) throw voucherRes.error
      return {
        branches: (branchRes.data ?? []) as { id: string; name: string }[],
        users: (userRes.data ?? []) as User[],
        records: (recordRes.data ?? []) as { teacher_id: string; total_amount: number; self_payment: number }[],
        feeTables: (feeRes.data ?? []) as FeeTable[],
        voucherConfigs: (voucherRes.data ?? []) as BranchVoucherConfig[],
      }
    },
    staleTime: 1000 * 30,
  })
}
