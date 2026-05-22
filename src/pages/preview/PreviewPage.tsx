import { useState } from 'react'
import { formatKRW, formatDate, todayStr, calcSupport } from '@/lib/utils'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'
import BottomNav from '@/components/ui/BottomNav'
import RecordFormFields from '@/components/ui/RecordFormFields'
import type { Attendance, PaymentMethod } from '@/types'

// ── 목업 데이터 ──────────────────────────────────────────────

const MOCK_TEACHER = { id: 't1', name: '김예나', role: 'teacher' as const, branch_id: 'b1', is_active: true, created_at: '' }

const MOCK_TODAY_RECORDS = [
  { id: '1', patient_name: '이지우', attendance: 'present' as const, fee_type: '신경계', session_count: 2, payment_method: 'education' as const, self_payment: 0, support_amount: 132000, total_amount: 132000, teacher_id: 't1', branch_id: 'b1', date: todayStr(), unit_price: 66000, created_at: '', updated_at: '' },
  { id: '2', patient_name: '박서준', attendance: 'present' as const, fee_type: '근골격계', session_count: 1, payment_method: 'card' as const, self_payment: 77000, support_amount: 0, total_amount: 77000, teacher_id: 't1', branch_id: 'b1', date: todayStr(), unit_price: 77000, created_at: '', updated_at: '' },
  { id: '3', patient_name: '최아린', attendance: 'absent' as const, fee_type: '소아', session_count: 1, payment_method: 'sports_voucher' as const, self_payment: 0, support_amount: 0, total_amount: 0, teacher_id: 't1', branch_id: 'b1', date: todayStr(), unit_price: 60000, created_at: '', updated_at: '' },
  { id: '4', patient_name: '한민준', attendance: 'makeup' as const, fee_type: '신경계', session_count: 1, payment_method: 'cash' as const, self_payment: 66000, support_amount: 0, total_amount: 66000, teacher_id: 't1', branch_id: 'b1', date: todayStr(), unit_price: 66000, created_at: '', updated_at: '' },
]

const MOCK_MONTH_SUMMARY = { total: 48, present: 38, absent: 6, makeup: 4, amount: 2_640_000 }

const MOCK_BRANCH_STATS = [
  {
    branch: { id: 'b1', name: '1호점' },
    totalCount: 124,
    totalAmount: 8_580_000,
    supportAmount: 3_200_000,
    selfPayment: 5_380_000,
    teacherStats: [
      { teacher: { id: 't1', name: '김예나', role: 'teacher' as const, branch_id: 'b1', is_active: true, created_at: '' }, count: 48, amount: 2_640_000 },
      { teacher: { id: 't2', name: '이수빈', role: 'teacher' as const, branch_id: 'b1', is_active: true, created_at: '' }, count: 41, amount: 1_980_000 },
      { teacher: { id: 't3', name: '박지수', role: 'teacher' as const, branch_id: 'b1', is_active: true, created_at: '' }, count: 35, amount: 760_000 },
    ],
  },
  {
    branch: { id: 'b2', name: '2호점' },
    totalCount: 86,
    totalAmount: 5_460_000,
    supportAmount: 1_800_000,
    selfPayment: 3_660_000,
    teacherStats: [
      { teacher: { id: 't4', name: '최민서', role: 'teacher' as const, branch_id: 'b2', is_active: true, created_at: '' }, count: 52, amount: 2_180_000 },
      { teacher: { id: 't5', name: '정하은', role: 'teacher' as const, branch_id: 'b2', is_active: true, created_at: '' }, count: 34, amount: 1_480_000 },
    ],
  },
]

// ── 선생님 대시보드 미리보기 ──────────────────────────────────

function TeacherPreview() {
  const today = todayStr()
  const statItems = [
    { label: '총건수', value: MOCK_MONTH_SUMMARY.total, color: 'text-gray-800', bg: 'bg-gray-100' },
    { label: '출석', value: MOCK_MONTH_SUMMARY.present, color: 'text-[#00b4d8]', bg: 'bg-[#e8f7fb]' },
    { label: '결석', value: MOCK_MONTH_SUMMARY.absent, color: 'text-[#e85b8a]', bg: 'bg-[#fdeef5]' },
    { label: '보강', value: MOCK_MONTH_SUMMARY.makeup, color: 'text-[#7db83a]', bg: 'bg-[#f0f9e8]' },
  ]

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc]">
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-gray-900 text-2xl font-bold">{MOCK_TEACHER.name} 선생님</h1>
            <p className="text-gray-400 text-sm mt-1">{formatDate(today)}</p>
          </div>
          <button className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full mt-1">
            로그아웃
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 space-y-3 pb-24 pt-3">
        <button className="w-full py-5 bg-[#00b4d8] text-white rounded-2xl text-lg font-bold shadow-md shadow-[#00b4d8]/30">
          + 오늘 건수 입력하기
        </button>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">이달 건수 요약</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {statItems.map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl py-3 text-center`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2.5">
            <span className="text-sm text-slate-500">이달 자부담 합계</span>
            <span className="text-base font-bold text-slate-900">{formatKRW(MOCK_MONTH_SUMMARY.amount)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-slate-700">오늘 입력 내역</h2>
            <span className="text-xs font-semibold text-[#00b4d8] bg-[#e8f7fb] px-2.5 py-0.5 rounded-full">
              {MOCK_TODAY_RECORDS.length}건
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {MOCK_TODAY_RECORDS.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    r.attendance === 'present' ? 'bg-[#00b4d8]' :
                    r.attendance === 'absent' ? 'bg-[#e85b8a]' : 'bg-[#7db83a]'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{r.patient_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회 · {PAYMENT_METHOD_LABELS[r.payment_method]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">
                      {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment || r.total_amount)}
                    </p>
                    {r.support_amount > 0 && (
                      <p className="text-xs text-[#00b4d8]">지원 {formatKRW(r.support_amount)}</p>
                    )}
                  </div>
                  <button className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">수정</button>
                </div>
              </div>
            ))}
          </div>
          <div className="h-2" />
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

// ── 대표 대시보드 미리보기 ────────────────────────────────────

function DirectorPreview() {
  const totalCount   = MOCK_BRANCH_STATS.reduce((a, s) => a + s.totalCount, 0)
  const totalAmount  = MOCK_BRANCH_STATS.reduce((a, s) => a + s.totalAmount, 0)
  const totalSelf    = MOCK_BRANCH_STATS.reduce((a, s) => a + s.selfPayment, 0)
  const totalSupport = MOCK_BRANCH_STATS.reduce((a, s) => a + s.supportAmount, 0)
  const maxCount     = Math.max(...MOCK_BRANCH_STATS.flatMap((s) => s.teacherStats.map((t) => t.count)), 1)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc] pb-16">
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-gray-900 text-2xl font-bold">대표</h1>
            <p className="text-gray-400 text-sm mt-1">이달 통합 현황</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 bg-[#f0f9e8] border border-[#7db83a]/30 px-2.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7db83a] animate-pulse" />
              <span className="text-[#7db83a] text-xs font-semibold">실시간</span>
            </div>
            <button className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
              로그아웃
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '총 건수', value: `${totalCount}건`, highlight: false },
            { label: '자부담 합계', value: formatKRW(totalSelf), highlight: true },
            { label: '총 청구액', value: formatKRW(totalAmount), highlight: false },
            { label: '지원금 합계', value: formatKRW(totalSupport), highlight: false },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl px-4 py-3 ${item.highlight ? 'bg-[#e8f7fb]' : 'bg-gray-50'}`}>
              <p className={`text-base font-bold truncate ${item.highlight ? 'text-[#00b4d8]' : 'text-gray-800'}`}>{item.value}</p>
              <p className="text-gray-400 text-xs mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {MOCK_BRANCH_STATS.map((s) => (
          <div key={s.branch.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{s.branch.name}</h2>
              <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">{s.totalCount}건</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '총 청구액', value: formatKRW(s.totalAmount), highlight: false },
                  { label: '지원금', value: formatKRW(s.supportAmount), highlight: false },
                  { label: '자부담', value: formatKRW(s.selfPayment), highlight: true },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl p-3 text-center ${item.highlight ? 'bg-[#e8f7fb]' : 'bg-slate-50'}`}>
                    <p className={`text-sm font-bold truncate ${item.highlight ? 'text-[#00b4d8]' : 'text-slate-800'}`}>{item.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">선생님별 건수</p>
                {s.teacherStats.map(({ teacher, count, amount }) => (
                  <div key={teacher.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium text-slate-700">{teacher.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900">{count}건</span>
                        <span className="text-xs text-slate-400 ml-1.5">{formatKRW(amount)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#00b4d8] to-[#0096b8] rounded-full"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  )
}

// ── 건수 입력 미리보기 ────────────────────────────────────────

const MOCK_FEE_TABLES = [
  { id: 'f1', branch_id: 'b1', fee_type: '신경계',   unit_price: 66000 },
  { id: 'f2', branch_id: 'b1', fee_type: '근골격계', unit_price: 77000 },
  { id: 'f3', branch_id: 'b1', fee_type: '소아',     unit_price: 60000 },
]

interface MockRow {
  id: string
  patient_name: string
  attendance: Attendance
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  support_amount: number
  self_payment: number
  total_amount: number
  after_school_support?: number
}

function newMockRow(): MockRow {
  return {
    id: Math.random().toString(36).slice(2),
    patient_name: '',
    attendance: 'present',
    fee_type: '',
    unit_price: 0,
    session_count: 1,
    payment_method: 'card',
    support_amount: 0,
    self_payment: 0,
    total_amount: 0,
  }
}

function DailyInputPreview() {
  const today = todayStr()
  const [rows, setRows] = useState<MockRow[]>([
    {
      id: 'r1',
      patient_name: '이지우',
      attendance: 'present',
      fee_type: '신경계',
      unit_price: 66000,
      session_count: 2,
      payment_method: 'education',
      support_amount: 132000,
      self_payment: 0,
      total_amount: 132000,
    },
    newMockRow(),
  ])

  const updateRow = (id: string, updates: Partial<MockRow>) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r
      const patched = { ...r, ...updates }
      const total = patched.attendance === 'absent' ? 0 : patched.unit_price * patched.session_count
      const { support, selfPayment } = patched.attendance === 'absent'
        ? { support: 0, selfPayment: 0 }
        : calcSupport(total, patched.payment_method, 0, patched.after_school_support)
      return { ...patched, total_amount: total, support_amount: support, self_payment: selfPayment }
    }))
  }

  const totalSelf    = rows.reduce((a, r) => a + r.self_payment, 0)
  const totalSupport = rows.reduce((a, r) => a + r.support_amount, 0)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc] pb-16">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-12 z-40">
        <button className="text-[#00b4d8] text-sm font-medium">←</button>
        <h1 className="flex-1 text-base font-bold text-gray-900">일 건수 입력</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 날짜 */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-500 shrink-0">날짜</span>
          <span className="flex-1 text-sm font-medium text-gray-900">{today}</span>
        </div>

        {/* 환자 행 */}
        {rows.map((row, idx) => (
          <div key={row.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">환자 {idx + 1}</span>
              {rows.length > 1 && (
                <button
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  className="text-[#e85b8a] text-xs"
                >삭제</button>
              )}
            </div>

            <input
              type="text"
              placeholder="환자명 입력"
              value={row.patient_name}
              onChange={(e) => updateRow(row.id, { patient_name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
            />

            <div className="flex gap-2">
              {(['present', 'absent', 'makeup'] as Attendance[]).map((a) => (
                <button
                  key={a}
                  onClick={() => updateRow(row.id, { attendance: a })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    row.attendance === a
                      ? a === 'absent' ? 'bg-[#e85b8a] text-white'
                        : a === 'makeup' ? 'bg-[#7db83a] text-white'
                        : 'bg-[#00b4d8] text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {ATTENDANCE_LABELS[a]}
                </button>
              ))}
            </div>

            {row.attendance !== 'absent' && (
              <RecordFormFields
                state={row}
                feeTables={MOCK_FEE_TABLES}
                total={row.total_amount}
                support={row.support_amount}
                selfPayment={row.self_payment}
                onChange={(updates) => updateRow(row.id, updates)}
              />
            )}
          </div>
        ))}

        <button
          onClick={() => setRows((prev) => [...prev, newMockRow()])}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm font-medium active:bg-gray-50 transition-colors"
        >
          + 환자 추가
        </button>
      </div>

      {/* 저장 고정 바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-4 pb-4 pt-3 bg-white border-t border-gray-100">
        <div className="flex justify-between text-sm text-gray-500 pb-1">
          <span>자부담 합계</span>
          <span className="font-bold text-gray-900">{formatKRW(totalSelf)}</span>
        </div>
        {totalSupport > 0 && (
          <div className="flex justify-between text-sm text-[#00b4d8] pb-2">
            <span>지원금 합계</span>
            <span>{formatKRW(totalSupport)}</span>
          </div>
        )}
        <button className="w-full py-4 bg-[#00b4d8] text-white rounded-xl font-bold text-base">
          저장하기
        </button>
      </div>
    </div>
  )
}

// ── 월별건수 미리보기 ─────────────────────────────────────────

const MOCK_MONTHLY_RECORDS = [
  // 4주차
  { id: 'm1', patient_name: '이지우', date: '2026-05-20', attendance: 'present'  as const, fee_type: '신경계',   session_count: 2, payment_method: 'education'     as const, total_amount: 132000, support_amount: 132000, self_payment: 0 },
  { id: 'm2', patient_name: '박서준', date: '2026-05-20', attendance: 'present'  as const, fee_type: '근골격계', session_count: 1, payment_method: 'card'          as const, total_amount: 77000,  support_amount: 0,      self_payment: 77000 },
  { id: 'm3', patient_name: '최아린', date: '2026-05-19', attendance: 'absent'   as const, fee_type: '소아',     session_count: 1, payment_method: 'sports_voucher' as const, total_amount: 0,      support_amount: 0,      self_payment: 0 },
  { id: 'm4', patient_name: '한민준', date: '2026-05-19', attendance: 'makeup'   as const, fee_type: '신경계',   session_count: 1, payment_method: 'cash'          as const, total_amount: 66000,  support_amount: 0,      self_payment: 66000 },
  // 3주차
  { id: 'm5', patient_name: '이지우', date: '2026-05-13', attendance: 'present'  as const, fee_type: '신경계',   session_count: 2, payment_method: 'education'     as const, total_amount: 132000, support_amount: 28000,  self_payment: 104000 },
  { id: 'm6', patient_name: '박서준', date: '2026-05-13', attendance: 'present'  as const, fee_type: '근골격계', session_count: 1, payment_method: 'card'          as const, total_amount: 77000,  support_amount: 0,      self_payment: 77000 },
  { id: 'm7', patient_name: '정다은', date: '2026-05-12', attendance: 'present'  as const, fee_type: '소아',     session_count: 1, payment_method: 'after_school'  as const, total_amount: 60000,  support_amount: 60000,  self_payment: 0 },
  // 2주차
  { id: 'm8', patient_name: '이지우', date: '2026-05-06', attendance: 'present'  as const, fee_type: '신경계',   session_count: 2, payment_method: 'education'     as const, total_amount: 132000, support_amount: 0,      self_payment: 132000 },
  { id: 'm9', patient_name: '최아린', date: '2026-05-05', attendance: 'present'  as const, fee_type: '소아',     session_count: 1, payment_method: 'sports_voucher' as const, total_amount: 60000,  support_amount: 60000,  self_payment: 0 },
]

function MonthlyPreview() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(5)

  const records = MOCK_MONTHLY_RECORDS

  const totalCount   = records.length
  const presentCount = records.filter((r) => r.attendance === 'present').length
  const absentCount  = records.filter((r) => r.attendance === 'absent').length
  const makeupCount  = records.filter((r) => r.attendance === 'makeup').length
  const totalAmount  = records.reduce((a, r) => a + r.total_amount, 0)
  const totalSupport = records.reduce((a, r) => a + r.support_amount, 0)
  const totalSelf    = records.reduce((a, r) => a + r.self_payment, 0)

  // 결제방식별 집계
  const byPayment: Record<string, { amount: number; support: number; self: number }> = {}
  for (const r of records) {
    if (!byPayment[r.payment_method]) byPayment[r.payment_method] = { amount: 0, support: 0, self: 0 }
    byPayment[r.payment_method].amount  += r.total_amount
    byPayment[r.payment_method].support += r.support_amount
    byPayment[r.payment_method].self    += r.self_payment
  }

  // 주차별 그룹
  const byWeek: Record<number, typeof records> = {}
  for (const r of records) {
    const d = new Date(r.date)
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
    const week = Math.ceil((d.getDate() + firstDay) / 7)
    if (!byWeek[week]) byWeek[week] = []
    byWeek[week].push(r)
  }

  const prevMonth = () => month === 1 ? (setYear(y => y - 1), setMonth(12)) : setMonth(m => m - 1)
  const nextMonth = () => month === 12 ? (setYear(y => y + 1), setMonth(1)) : setMonth(m => m + 1)

  return (
    <div className="flex flex-col min-h-dvh bg-[#f7f8fc] pb-16">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-12 z-40">
        <h1 className="flex-1 text-base font-bold text-gray-900">월별 건수</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3">
        {/* 월 선택 */}
        <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
          <button onClick={prevMonth} className="text-[#00b4d8] text-xl px-2">‹</button>
          <span className="font-bold text-gray-800">{year}년 {month}월</span>
          <button onClick={nextMonth} className="text-[#00b4d8] text-xl px-2">›</button>
        </div>

        {/* 월 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">이달 요약</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: '총건수', value: totalCount,   color: 'text-gray-800', bg: 'bg-gray-100' },
              { label: '출석',   value: presentCount, color: 'text-[#00b4d8]', bg: 'bg-[#e8f7fb]' },
              { label: '결석',   value: absentCount,  color: 'text-[#e85b8a]', bg: 'bg-[#fdeef5]' },
              { label: '보강',   value: makeupCount,  color: 'text-[#7db83a]', bg: 'bg-[#f0f9e8]' },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl py-3 text-center`}>
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">총 청구액</span>
              <span className="font-medium text-gray-800">{formatKRW(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#00b4d8]">지원금</span>
              <span className="text-[#00b4d8]">{formatKRW(totalSupport)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span className="text-gray-700">자부담</span>
              <span className="text-gray-900">{formatKRW(totalSelf)}</span>
            </div>
          </div>
        </div>

        {/* 결제방식별 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">결제방식별 금액</p>
          {Object.entries(byPayment).map(([method, data]) => (
            <div key={method} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS]}</span>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatKRW(data.self)} <span className="text-xs text-gray-400 font-normal">자부담</span></p>
                {data.support > 0 && <p className="text-xs text-[#00b4d8]">지원금 {formatKRW(data.support)}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* 주차별 상세 */}
        {Object.entries(byWeek).sort(([a], [b]) => Number(b) - Number(a)).map(([week, weekRecords]) => (
          <div key={week} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{week}주차</p>
            {weekRecords.map((r) => (
              <div key={r.id} className="py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      r.attendance === 'present' ? 'bg-[#00b4d8]' :
                      r.attendance === 'absent'  ? 'bg-[#e85b8a]' : 'bg-[#7db83a]'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{r.patient_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.date.slice(5)} · {ATTENDANCE_LABELS[r.attendance]} · {r.fee_type} {r.session_count}회 · {PAYMENT_METHOD_LABELS[r.payment_method as keyof typeof PAYMENT_METHOD_LABELS]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {r.attendance === 'absent' ? '—' : formatKRW(r.self_payment)}
                      </p>
                      {r.support_amount > 0 && (
                        <p className="text-xs text-[#00b4d8]">지원 {formatKRW(r.support_amount)}</p>
                      )}
                    </div>
                    <button className="text-xs text-[#00b4d8] bg-[#e8f7fb] px-2 py-1 rounded-lg">수정</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}

// ── 미리보기 탭 전환 ──────────────────────────────────────────

export default function PreviewPage() {
  const [tab, setTab] = useState<'teacher' | 'director' | 'input' | 'monthly'>('teacher')

  return (
    <div className="relative">
      {/* 탭 전환 바 */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 bg-white/90 backdrop-blur border-b border-gray-100 flex">
        {([
          { key: 'teacher', label: '선생님 홈' },
          { key: 'input',   label: '건수 입력' },
          { key: 'monthly', label: '월별건수'  },
          { key: 'director',label: '대표 홈'   },
        ] as { key: typeof tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-xs font-bold transition-colors ${tab === key ? 'text-[#00b4d8] border-b-2 border-[#00b4d8]' : 'text-gray-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pt-12">
        {tab === 'teacher'  ? <TeacherPreview /> :
         tab === 'input'    ? <DailyInputPreview /> :
         tab === 'monthly'  ? <MonthlyPreview /> :
                              <DirectorPreview />}
      </div>
    </div>
  )
}
