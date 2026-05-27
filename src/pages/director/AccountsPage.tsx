import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatKRW, todayStr } from '@/lib/utils'
import { JOB_TITLE_OPTIONS } from '@/constants'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ErrorState from '@/components/ui/ErrorState'
import { useAccountsData } from '@/hooks/queries'
import { useAddFee, useDeleteFee, useAddTeacher } from '@/hooks/mutations'
import type { User, FeeTable } from '@/types'

interface TeacherWithStats extends User {
  monthCount: number
  monthTotal: number
}

export default function AccountsPage() {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = todayStr()

  const { data, isLoading, error, refetch } = useAccountsData(monthStart, today)


  const addFee = useAddFee(monthStart, today)
  const deleteFee = useDeleteFee(monthStart, today)
  const addTeacher = useAddTeacher(monthStart, today)


  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', branch_id: '', pin: '0000', jobTitle: '', role: 'teacher' })
  const [feeOpenBranch, setFeeOpenBranch] = useState<string | null>(null)
  const [feeForm, setFeeForm] = useState({ fee_type: '', unit_price: '' })

  const branches = data?.branches ?? []
  const feeTables = data?.feeTables ?? []

  const teachers: TeacherWithStats[] = (data?.users ?? []).map((t) => {
    const tRecords = (data?.records ?? []).filter((r) => r.teacher_id === t.id)
    return {
      ...t,
      monthCount: tRecords.length,
      monthTotal: tRecords.reduce((acc, r) => acc + r.total_amount, 0),
    }
  })

  const handleAddFee = async (branchId: string) => {
    if (!feeForm.fee_type.trim() || !feeForm.unit_price) return
    try {
      await addFee.mutateAsync({ branchId, feeType: feeForm.fee_type.trim(), unitPrice: Number(feeForm.unit_price) })
      setFeeForm({ fee_type: '', unit_price: '' })
    } catch (e) {
      alert(`추가 실패: ${(e as Error).message}`)
    }
  }

  const handleDeleteFee = async (id: string) => {
    try {
      await deleteFee.mutateAsync(id)
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message}`)
    }
  }

  const handleAddTeacher = async () => {
    if (!form.name.trim() || !form.branch_id || form.pin.length !== 4) return
    try {
      await addTeacher.mutateAsync({
        name: form.name,
        branchId: form.branch_id,
        pin: form.pin,
        jobTitle: form.jobTitle,
        role: form.role,
      })
      setShowForm(false)
      setForm({ name: '', branch_id: '', pin: '0000', jobTitle: '', role: 'teacher' })
    } catch (e) {
      alert(`계정 생성 실패: ${(e as Error).message}`)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 선생님 계정을 삭제하시겠습니까?\n\n⚠️ 해당 선생님의 모든 건수 기록도 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`)) return
    const { error } = await supabase.rpc('delete_teacher_account', { p_teacher_id: id })
    if (error) { alert(`삭제 실패: ${error.message}`); return }
    void refetch()
  }

  const handlePinReset = async (id: string, name: string) => {
    if (!confirm(`"${name}" 선생님의 PIN을 0000으로 초기화할까요?`)) return
    const { error: rpcError } = await supabase.rpc('reset_teacher_pin', { p_teacher_id: id })
    if (rpcError) { alert(`PIN 초기화 실패: ${rpcError.message}`); return }
    alert(`${name} 선생님의 PIN이 0000으로 초기화되었습니다.`)
  }

  const byBranch = branches.map((b) => ({
    branch: b,
    teachers: teachers.filter((t) => t.branch_id === b.id),
  }))

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-dvh pb-16">
        <PageHeader title="직원 관리" />
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-dvh pb-16">
        <PageHeader title="직원 관리" />
        <ErrorState onRetry={refetch} />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="직원 관리" />

      <div className="flex-1 px-4 py-4 space-y-4 md:max-w-3xl md:mx-auto md:w-full">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full py-3 bg-[#00b4d8] text-white rounded-xl font-semibold active:bg-[#0096b8] transition-colors"
        >
          + 직원 추가
        </button>

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">직원 정보 입력</h2>
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
            />
            <div>
              <p className="text-xs text-gray-400 mb-1.5">직급</p>
              <div className="grid grid-cols-3 gap-1.5">
                {JOB_TITLE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, jobTitle: t }))}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors
                      ${form.jobTitle === t ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">역할</p>
              <div className="flex gap-2">
                {(['teacher', 'director'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                      ${form.role === r ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {r === 'director' ? '대표' : '선생님'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">호점 배정</p>
              <div className="flex gap-2">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setForm((f) => ({ ...f, branch_id: b.id }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                      ${form.branch_id === b.id ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">초기 PIN <span className="text-gray-300">(기본값 0000, 변경 가능)</span></p>
              <input
                type="password"
                inputMode="numeric"
                placeholder="초기 PIN 4자리"
                maxLength={4}
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setForm({ name: '', branch_id: '', pin: '0000', jobTitle: '', role: 'teacher' }) }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-500 text-sm"
              >취소</button>
              <button
                onClick={handleAddTeacher}
                disabled={addTeacher.isPending || !form.name.trim() || !form.branch_id || form.pin.length !== 4}
                className="flex-1 py-2 bg-[#00b4d8] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
              >{addTeacher.isPending ? '추가 중…' : '추가'}</button>
            </div>
          </div>
        )}

        {byBranch.map(({ branch, teachers: bt }) => {
          const branchFees = feeTables.filter((f: FeeTable) => f.branch_id === branch.id)
          const feeOpen = feeOpenBranch === branch.id
          return (
            <div key={branch.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-700">{branch.name}</h2>

              {bt.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-1">등록된 선생님이 없습니다.</p>
              ) : (
                bt.map((t) => (
                  <div key={t.id} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-gray-900">{t.name}</p>
                          {t.job_title && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t.job_title}</span>
                          )}
                          {t.role === 'director' && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">대표</span>
                          )}
                          {t.role === 'admin' && (
                            <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">관리자</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          이달 {t.monthCount}건 · 총액 {formatKRW(t.monthTotal)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handlePinReset(t.id, t.name)}
                          className="text-xs text-[#00b4d8] px-2 py-1 bg-[#e8f7fb] rounded-lg active:bg-[#d0eff7] transition-colors"
                        >PIN 초기화</button>
                        {t.role !== 'director' && (
                          <button
                            onClick={() => handleDelete(t.id, t.name)}
                            className="text-xs text-red-400 px-2 py-1 bg-red-50 rounded-lg active:bg-red-100 transition-colors"
                          >삭제</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* 요금표 관리 */}
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => { setFeeOpenBranch(feeOpen ? null : branch.id); setFeeForm({ fee_type: '', unit_price: '' }) }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"
                >
                  <span>요금 관리</span>
                  <span className="text-gray-300 ml-1">{branchFees.length}개</span>
                  <span className="ml-auto text-gray-300">{feeOpen ? '▲' : '▼'}</span>
                </button>

                {feeOpen && (
                  <div className="mt-3 space-y-2">
                    {branchFees.length === 0 ? (
                      <p className="text-xs text-gray-300 text-center py-1">등록된 요금이 없습니다.</p>
                    ) : (
                      branchFees.map((fee: FeeTable) => (
                        <div key={fee.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{fee.fee_type}</span>
                            <span className="text-xs text-gray-400 ml-2">{formatKRW(fee.unit_price)}/회</span>
                          </div>
                          <button
                            onClick={() => handleDeleteFee(fee.id)}
                            className="text-xs text-red-400 px-2 py-0.5 bg-red-50 rounded"
                          >삭제</button>
                        </div>
                      ))
                    )}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="요금 이름 (예: 일반)"
                        value={feeForm.fee_type}
                        onChange={(e) => setFeeForm((f) => ({ ...f, fee_type: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#00b4d8]"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="단가(원)"
                        value={feeForm.unit_price}
                        onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
                        onChange={(e) => setFeeForm((f) => ({ ...f, unit_price: e.target.value }))}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#00b4d8]"
                      />
                      <button
                        onClick={() => handleAddFee(branch.id)}
                        disabled={addFee.isPending || !feeForm.fee_type.trim() || !feeForm.unit_price}
                        className="px-3 py-1.5 bg-[#00b4d8] text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                      >추가</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <BottomNav />
    </div>
  )
}
