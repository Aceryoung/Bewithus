import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
