import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS } from '@/constants'
import RecordFormFields from '@/components/ui/RecordFormFields'
import type { Record as SessionRecord, Attendance, PaymentMethod, FeeTable } from '@/types'

interface EditState {
  attendance: Attendance
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  after_school_support?: number
}

interface Props {
  record: SessionRecord
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export default function RecordEditSheet({ record, onSave, onDelete, onClose }: Props) {
  const [state, setState] = useState<EditState>({
    attendance: record.attendance,
    fee_type: record.fee_type,
    unit_price: record.unit_price,
    session_count: record.session_count,
    payment_method: record.payment_method,
    // 방과후인 경우 기존 support_amount를 초기값으로 설정
    after_school_support:
      record.payment_method === 'after_school' ? record.support_amount : undefined,
  })
  const [feeTables, setFeeTables] = useState<FeeTable[]>([])
  // 이달 지원금 사용량 (현재 레코드 제외)
  const [monthlyUsed, setMonthlyUsed] = useState<Record<PaymentMethod, number>>({
    education: 0,
    sports_voucher: 0,
    after_school: 0,
    card: 0,
    cash: 0,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 호점별 요금표 로드
  useEffect(() => {
    supabase
      .from('fee_tables')
      .select('*')
      .eq('branch_id', record.branch_id)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setFeeTables(data as FeeTable[])
      })
  }, [record.branch_id])

  // 이달 지원금 사용량 (현재 레코드 제외)
  useEffect(() => {
    const d = new Date(record.date)
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth =
      d.getMonth() === 11
        ? `${d.getFullYear() + 1}-01-01`
        : `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, '0')}-01`

    supabase
      .from('records')
      .select('payment_method, support_amount')
      .eq('teacher_id', record.teacher_id)
      .eq('patient_name', record.patient_name)
      .gte('date', monthStart)
      .lt('date', nextMonth)
      .neq('id', record.id) // 현재 레코드는 제외
      .then(({ data }) => {
        if (!data) return
        const used: Record<PaymentMethod, number> = {
          education: 0,
          sports_voucher: 0,
          after_school: 0,
          card: 0,
          cash: 0,
        }
        for (const r of data) {
          used[r.payment_method as PaymentMethod] += r.support_amount
        }
        setMonthlyUsed(used)
      })
  }, [record])

  const update = (patch: Partial<EditState>) => setState((prev) => ({ ...prev, ...patch }))

  // 실시간 금액 계산
  const total =
    state.attendance === 'absent' ? 0 : state.unit_price * state.session_count

  const { support, selfPayment } =
    state.attendance === 'absent'
      ? { support: 0, selfPayment: 0 }
      : calcSupport(
          total,
          state.payment_method,
          monthlyUsed[state.payment_method],
          state.after_school_support,
        )

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('records')
      .update({
        attendance: state.attendance,
        // 결석 시 fee_type은 기존 값 유지 (데이터 정합성)
        fee_type:
          state.attendance === 'absent'
            ? record.fee_type
            : state.fee_type || '직접입력',
        unit_price: state.attendance === 'absent' ? 0 : state.unit_price,
        session_count: state.session_count,
        total_amount: total,
        payment_method: state.payment_method,
        support_amount: support,
        self_payment: selfPayment,
      })
      .eq('id', record.id)

    setSaving(false)
    if (error) {
      alert(`수정 실패: ${error.message}`)
    } else {
      onSave()
    }
  }

  const handleDelete = async () => {
    if (!confirm(`"${record.patient_name}" 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`))
      return
    setDeleting(true)
    const { error } = await supabase.from('records').delete().eq('id', record.id)
    setDeleting(false)
    if (error) {
      alert(`삭제 실패: ${error.message}`)
    } else {
      onDelete()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      {/* 반투명 오버레이 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* 바텀 시트 */}
      <div
        className="relative bg-white rounded-t-2xl max-h-[88dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-8 space-y-4">
          {/* 헤더 */}
          <div className="flex justify-between items-center pt-1">
            <div>
              <h2 className="font-bold text-gray-900 text-base">{record.patient_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{record.date} 기록 수정</p>
            </div>
            <button onClick={onClose} className="text-gray-400 text-xl px-1">
              ×
            </button>
          </div>

          {/* 출결 */}
          <div className="flex gap-2">
            {(['present', 'absent', 'makeup'] as Attendance[]).map((a) => (
              <button
                key={a}
                onClick={() => update({ attendance: a })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    state.attendance === a
                      ? a === 'absent'
                        ? 'bg-red-500 text-white'
                        : a === 'makeup'
                        ? 'bg-green-500 text-white'
                        : 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
              >
                {ATTENDANCE_LABELS[a]}
              </button>
            ))}
          </div>

          {/* 출석·보강 시에만 아래 항목 표시 */}
          {state.attendance !== 'absent' && (
            <RecordFormFields
              state={state}
              feeTables={feeTables}
              total={total}
              support={support}
              selfPayment={selfPayment}
              onChange={update}
            />
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="py-3 px-4 border border-red-200 text-red-500 rounded-xl text-sm font-medium disabled:opacity-40 active:bg-red-50 transition-colors"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="py-3 px-4 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium disabled:opacity-40 active:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:bg-blue-700 transition-colors"
            >
              {saving ? '저장 중…' : '수정 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
