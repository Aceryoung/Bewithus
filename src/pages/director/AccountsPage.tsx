import { useState, useEffect } from 'react'
import { supabase, createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import { formatKRW, todayStr } from '@/lib/utils'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { User, FeeTable } from '@/types'

interface TeacherWithStats extends User {
  monthCount: number
  monthSelf: number
}

export default function AccountsPage() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<TeacherWithStats[]>([])
  const [feeTables, setFeeTables] = useState<FeeTable[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', branch_id: '', pin: '', role: 'teacher' })
  const [saving, setSaving] = useState(false)

  /* 요금 관리 상태 */
  const [feeOpenBranch, setFeeOpenBranch] = useState<string | null>(null)
  const [feeForm, setFeeForm] = useState({ fee_type: '', unit_price: '' })
  const [savingFee, setSavingFee] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [branchRes, userRes, recordRes, feeRes] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('users').select('*').in('role', ['teacher', 'admin']).order('name'),
      supabase.from('records').select('teacher_id, self_payment')
        .gte('date', monthStart).lte('date', todayStr()),
      supabase.from('fee_tables').select('*').eq('is_active', true).order('fee_type'),
    ])

    const branchList = (branchRes.data ?? []) as { id: string; name: string }[]
    setBranches(branchList)
    setFeeTables((feeRes.data ?? []) as FeeTable[])

    const teacherList = (userRes.data ?? []) as User[]
    const recordList = (recordRes.data ?? []) as { teacher_id: string; self_payment: number }[]

    setTeachers(
      teacherList.map((t) => {
        const tRecords = recordList.filter((r) => r.teacher_id === t.id)
        return {
          ...t,
          monthCount: tRecords.length,
          monthSelf: tRecords.reduce((acc, r) => acc + r.self_payment, 0),
        }
      }),
    )
  }

  const handleAddFee = async (branchId: string) => {
    if (!feeForm.fee_type.trim() || !feeForm.unit_price) return
    setSavingFee(true)
    const { error } = await supabase.from('fee_tables').insert({
      branch_id: branchId,
      fee_type: feeForm.fee_type.trim(),
      unit_price: Number(feeForm.unit_price),
      is_active: true,
    })
    setSavingFee(false)
    if (error) { alert(`추가 실패: ${error.message}`); return }
    setFeeForm({ fee_type: '', unit_price: '' })
    loadData()
  }

  const handleDeleteFee = async (id: string) => {
    const { error } = await supabase.from('fee_tables').delete().eq('id', id)
    if (error) { alert(`삭제 실패: ${error.message}`); return }
    loadData()
  }

  // ── 선생님 추가 ──────────────────────────────────────────────
  const handleAddTeacher = async () => {
    if (!form.name.trim() || !form.branch_id || form.pin.length !== 4 || !form.role) return
    setSaving(true)

    // 1) 안정적 users.id 미리 생성
    const userId = crypto.randomUUID()
    const email   = userEmail(userId)
    const password = pinToPassword(form.pin)

    // 2) 임시 클라이언트로 Supabase Auth 계정 생성 (대표 세션 오염 없음)
    const tmp = createTempClient()
    const { data: signUpData, error: signUpError } = await tmp.auth.signUp({ email, password })

    if (signUpError || !signUpData.user) {
      setSaving(false)
      alert(
        signUpData?.user && !signUpData.session
          ? 'Supabase Auth 설정 오류: "Enable email confirmations"를 OFF로 변경하세요.'
          : `계정 생성 실패: ${signUpError?.message ?? '알 수 없는 오류'}`,
      )
      return
    }

    // 3) users 테이블에 프로필 저장 (auth_id 연결)
    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      auth_id: signUpData.user.id,
      name: form.name.trim(),
      role: form.role,
      branch_id: form.branch_id,
      is_active: true,
    })

    setSaving(false)
    if (insertError) {
      alert(`프로필 저장 실패: ${insertError.message}`)
      return
    }

    setShowForm(false)
    setForm({ name: '', branch_id: '', pin: '', role: 'teacher' })
    loadData()
  }

  // ── 계정 삭제 ────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 선생님 계정을 삭제하시겠습니까?\n\n⚠️ 해당 선생님의 모든 건수 기록도 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`)) return
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) {
      alert(`삭제 실패: ${error.message}`)
      return
    }
    loadData()
  }

  // ── PIN 초기화 (0000으로 리셋) ──────────────────────────────
  const handlePinReset = async (id: string, name: string) => {
    if (!confirm(`"${name}" 선생님의 PIN을 0000으로 초기화할까요?`)) return
    const { error } = await supabase.rpc('reset_teacher_pin', { p_teacher_id: id })
    if (error) {
      alert(`PIN 초기화 실패: ${error.message}`)
      return
    }
    alert(`${name} 선생님의 PIN이 0000으로 초기화되었습니다.`)
  }

  const byBranch = branches.map((b) => ({
    branch: b,
    teachers: teachers.filter((t) => t.branch_id === b.id),
  }))

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="직원 관리" />

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 선생님 추가 버튼 */}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full py-3 bg-[#00b4d8] text-white rounded-xl font-semibold active:bg-[#0096b8] transition-colors"
        >
          + 선생님 추가
        </button>

        {/* 추가 폼 */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">선생님 정보 입력</h2>
            <input
              type="text"
              placeholder="이름"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
            />
            <div>
              <p className="text-xs text-gray-400 mb-1.5">역할</p>
              <div className="flex gap-2">
                {[
                  { value: 'teacher', label: '선생님' },
                  { value: 'admin',   label: '관리자' },
                ].map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                      ${form.role === r.value ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {r.label}
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
            <input
              type="password"
              inputMode="numeric"
              placeholder="초기 PIN 4자리"
              maxLength={4}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setForm({ name: '', branch_id: '', pin: '', role: 'teacher' }) }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-500 text-sm"
              >취소</button>
              <button
                onClick={handleAddTeacher}
                disabled={saving || !form.name.trim() || !form.branch_id || form.pin.length !== 4}
                className="flex-1 py-2 bg-[#00b4d8] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
              >{saving ? '추가 중…' : '추가'}</button>
            </div>
          </div>
        )}

        {/* 호점별 선생님 + 요금표 */}
        {byBranch.map(({ branch, teachers: bt }) => {
          const branchFees = feeTables.filter((f) => f.branch_id === branch.id)
          const feeOpen = feeOpenBranch === branch.id
          return (
            <div key={branch.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-700">{branch.name}</h2>

              {/* 선생님 목록 */}
              {bt.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-1">등록된 선생님이 없습니다.</p>
              ) : (
                bt.map((t) => (
                  <div key={t.id} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{t.name}</p>
                          {t.role === 'admin' && (
                            <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">관리자</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          이달 {t.monthCount}건 · 자부담 {formatKRW(t.monthSelf)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handlePinReset(t.id, t.name)}
                          className="text-xs text-[#00b4d8] px-2 py-1 bg-[#e8f7fb] rounded-lg active:bg-[#d0eff7] transition-colors"
                        >
                          PIN 초기화
                        </button>
                        <button
                          onClick={() => handleDelete(t.id, t.name)}
                          className="text-xs text-red-400 px-2 py-1 bg-red-50 rounded-lg active:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* 요금표 관리 */}
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => {
                    setFeeOpenBranch(feeOpen ? null : branch.id)
                    setFeeForm({ fee_type: '', unit_price: '' })
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"
                >
                  <span>💰</span>
                  <span>요금 관리</span>
                  <span className="text-gray-300 ml-1">{branchFees.length}개</span>
                  <span className="ml-auto text-gray-300">{feeOpen ? '▲' : '▼'}</span>
                </button>

                {feeOpen && (
                  <div className="mt-3 space-y-2">
                    {/* 현재 요금 목록 */}
                    {branchFees.length === 0 ? (
                      <p className="text-xs text-gray-300 text-center py-1">등록된 요금이 없습니다.</p>
                    ) : (
                      branchFees.map((fee) => (
                        <div key={fee.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{fee.fee_type}</span>
                            <span className="text-xs text-gray-400 ml-2">{formatKRW(fee.unit_price)}/회</span>
                          </div>
                          <button
                            onClick={() => handleDeleteFee(fee.id)}
                            className="text-xs text-red-400 px-2 py-0.5 bg-red-50 rounded"
                          >
                            삭제
                          </button>
                        </div>
                      ))
                    )}

                    {/* 요금 추가 폼 */}
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
                        disabled={savingFee || !feeForm.fee_type.trim() || !feeForm.unit_price}
                        className="px-3 py-1.5 bg-[#00b4d8] text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                      >
                        추가
                      </button>
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
