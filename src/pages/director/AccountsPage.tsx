import { useState, useEffect } from 'react'
import { supabase, createTempClient, userEmail, pinToPassword } from '@/lib/supabase'
import { formatKRW, todayStr } from '@/lib/utils'
import PageHeader from '@/components/ui/PageHeader'
import BottomNav from '@/components/ui/BottomNav'
import type { User } from '@/types'

interface TeacherWithStats extends User {
  monthCount: number
  monthSelf: number
}

interface PinEditState {
  teacherId: string
  currentPin: string
  newPin: string
  confirmPin: string
}

export default function AccountsPage() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<TeacherWithStats[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', branch_id: '', pin: '' })
  const [saving, setSaving] = useState(false)
  const [pinEdit, setPinEdit] = useState<PinEditState | null>(null)
  const [pinChanging, setPinChanging] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [branchRes, userRes, recordRes] = await Promise.all([
      supabase.from('branches').select('id, name'),
      supabase.from('users').select('*').eq('role', 'teacher').order('name'),
      supabase.from('records').select('teacher_id, self_payment')
        .gte('date', monthStart).lte('date', todayStr()),
    ])

    const branchList = (branchRes.data ?? []) as { id: string; name: string }[]
    setBranches(branchList)

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

  // ── 선생님 추가 ──────────────────────────────────────────────
  const handleAddTeacher = async () => {
    if (!form.name.trim() || !form.branch_id || form.pin.length !== 4) return
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
      role: 'teacher',
      branch_id: form.branch_id,
      is_active: true,
    })

    setSaving(false)
    if (insertError) {
      alert(`프로필 저장 실패: ${insertError.message}`)
      return
    }

    setShowForm(false)
    setForm({ name: '', branch_id: '', pin: '' })
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

  // ── PIN 변경 ─────────────────────────────────────────────────
  // 현재 PIN 검증 → 새 PIN 설정 (tempClient로 사용자 로그인 후 updateUser)
  const handlePinChange = async () => {
    if (!pinEdit) return
    const { teacherId, currentPin, newPin, confirmPin } = pinEdit

    if (newPin.length !== 4) { alert('새 PIN은 4자리여야 합니다.'); return }
    if (newPin !== confirmPin) { alert('새 PIN과 확인 PIN이 다릅니다.'); return }

    const teacher = teachers.find((t) => t.id === teacherId)
    if (!teacher) return

    setPinChanging(true)

    // 현재 PIN 으로 임시 로그인
    const tmp = createTempClient()
    const { error: signInError } = await tmp.auth.signInWithPassword({
      email: userEmail(teacherId),
      password: pinToPassword(currentPin),
    })

    if (signInError) {
      setPinChanging(false)
      alert('현재 PIN이 올바르지 않습니다.')
      return
    }

    // 비밀번호(PIN) 변경
    const { error: updateError } = await tmp.auth.updateUser({
      password: pinToPassword(newPin),
    })

    setPinChanging(false)

    if (updateError) {
      alert(`PIN 변경 실패: ${updateError.message}`)
      return
    }

    alert(`${teacher.name} 선생님의 PIN이 변경되었습니다.`)
    setPinEdit(null)
  }

  const byBranch = branches.map((b) => ({
    branch: b,
    teachers: teachers.filter((t) => t.branch_id === b.id),
  }))

  return (
    <div className="flex flex-col min-h-dvh pb-16">
      <PageHeader title="계정 관리" />

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
                onClick={() => { setShowForm(false); setForm({ name: '', branch_id: '', pin: '' }) }}
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

        {/* PIN 변경 모달 */}
        {pinEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => setPinEdit(null)}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-3"
              onClick={(e) => e.stopPropagation()}>
              <h2 className="font-bold text-gray-900 text-base">
                {teachers.find((t) => t.id === pinEdit.teacherId)?.name} PIN 변경
              </h2>
              <input
                type="password"
                inputMode="numeric"
                placeholder="현재 PIN 4자리"
                maxLength={4}
                value={pinEdit.currentPin}
                onChange={(e) => setPinEdit((p) => p && ({ ...p, currentPin: e.target.value.replace(/\D/g,'').slice(0,4) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
              />
              <input
                type="password"
                inputMode="numeric"
                placeholder="새 PIN 4자리"
                maxLength={4}
                value={pinEdit.newPin}
                onChange={(e) => setPinEdit((p) => p && ({ ...p, newPin: e.target.value.replace(/\D/g,'').slice(0,4) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
              />
              <input
                type="password"
                inputMode="numeric"
                placeholder="새 PIN 확인"
                maxLength={4}
                value={pinEdit.confirmPin}
                onChange={(e) => setPinEdit((p) => p && ({ ...p, confirmPin: e.target.value.replace(/\D/g,'').slice(0,4) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
              />
              <p className="text-xs text-gray-400">현재 PIN을 먼저 입력해야 변경할 수 있습니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setPinEdit(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-500 text-sm">
                  취소
                </button>
                <button
                  onClick={handlePinChange}
                  disabled={pinChanging || pinEdit.currentPin.length !== 4 || pinEdit.newPin.length !== 4 || pinEdit.confirmPin.length !== 4}
                  className="flex-1 py-2.5 bg-[#00b4d8] text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                >{pinChanging ? '변경 중…' : 'PIN 변경'}</button>
              </div>
            </div>
          </div>
        )}

        {/* 호점별 선생님 목록 */}
        {byBranch.map(({ branch, teachers: bt }) => (
          <div key={branch.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">{branch.name}</h2>
            {bt.length === 0 ? (
              <p className="text-xs text-gray-300 text-center py-2">등록된 선생님이 없습니다.</p>
            ) : (
              bt.map((t) => (
                <div key={t.id} className="py-3 border-b border-gray-50 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        이달 {t.monthCount}건 · 자부담 {formatKRW(t.monthSelf)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPinEdit({ teacherId: t.id, currentPin: '', newPin: '', confirmPin: '' })}
                        className="text-xs text-[#00b4d8] px-2 py-1 bg-[#e8f7fb] rounded-lg"
                      >
                        PIN 변경
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
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
