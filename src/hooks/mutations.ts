import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import { qk } from './queries'

// ── 기록 삭제 ────────────────────────────────────────────────
export function useDeleteRecord(teacherId: string, today: string, monthStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from('records').delete().eq('id', recordId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.todayRecords(teacherId, today) })
      queryClient.invalidateQueries({ queryKey: qk.monthSummary(teacherId, monthStart) })
    },
  })
}

// ── 기록 수정 ────────────────────────────────────────────────
export function useUpdateRecord(teacherId: string, today: string, monthStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from('records').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.todayRecords(teacherId, today) })
      queryClient.invalidateQueries({ queryKey: qk.monthSummary(teacherId, monthStart) })
    },
  })
}

// ── 요금표 추가 ──────────────────────────────────────────────
export function useAddFee(monthStart: string, today: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ branchId, feeType, unitPrice }: { branchId: string; feeType: string; unitPrice: number }) => {
      const { error } = await supabase.from('fee_tables').insert({
        branch_id: branchId, fee_type: feeType, unit_price: unitPrice, is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.accountsData(monthStart, today) })
    },
  })
}

// ── 요금표 삭제 ──────────────────────────────────────────────
export function useDeleteFee(monthStart: string, today: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_tables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.accountsData(monthStart, today) })
    },
  })
}

// ── 선생님 추가 ──────────────────────────────────────────────
export function useAddTeacher(monthStart: string, today: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, branchId, pin }: { name: string; branchId: string; pin: string }) => {
      const userId = crypto.randomUUID()
      const tmp = createTempClient()
      const { data: signUpData, error: signUpError } = await tmp.auth.signUp({
        email: userEmail(userId),
        password: pinToPassword(pin),
      })
      if (signUpError || !signUpData.user) {
        throw new Error(
          signUpData?.user && !signUpData.session
            ? 'Supabase Auth 설정 오류: "Enable email confirmations"를 OFF로 변경하세요.'
            : (signUpError?.message ?? '알 수 없는 오류'),
        )
      }
      const { error: insertError } = await supabase.from('users').insert({
        id: userId,
        auth_id: signUpData.user.id,
        name: name.trim(),
        role: 'teacher',
        branch_id: branchId,
        is_active: true,
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.accountsData(monthStart, today) })
    },
  })
}

// ── 사용자 삭제 ──────────────────────────────────────────────
export function useDeleteUser(monthStart: string, today: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.accountsData(monthStart, today) })
    },
  })
}
