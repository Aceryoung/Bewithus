import { useState, useEffect } from 'react'
import type { BranchVoucherConfig, PaymentMethod, FeeTable } from '@/types'
import { formatKRW } from '@/lib/utils'
import { PAYMENT_METHOD_LABELS, BRANCH_VOUCHER_CONFIG, MONTHLY_SUPPORT_LIMITS } from '@/constants'

export interface RecordFieldState {
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  secondary_methods: PaymentMethod[]
  secondary_overrides: Partial<Record<PaymentMethod, number>>
  payment_note?: string
}

const PRIMARY_METHODS: PaymentMethod[] = ['card', 'cash', 'bank_transfer', 'other']
const PRIMARY_SET = new Set<PaymentMethod>(PRIMARY_METHODS)
const DEFAULT_VOUCHER_METHODS: PaymentMethod[] = ['education', 'sports_voucher', 'after_school']

interface Props {
  state: RecordFieldState
  feeTables: FeeTable[]
  total: number
  voucherSupports: Partial<Record<PaymentMethod, number>>
  remainingSupport: number
  selfPayment: number
  onChange: (updates: Partial<RecordFieldState>) => void
  branchName?: string
  voucherConfig?: BranchVoucherConfig[]
  allowHalfSession?: boolean
}

export default function RecordFormFields({
  state, feeTables, total, voucherSupports, remainingSupport, selfPayment, onChange, branchName, voucherConfig, allowHalfSession = false,
}: Props) {
  const totalSupport = Object.values(voucherSupports).reduce((a, b) => a + (b ?? 0), 0)
  const [countDisplay, setCountDisplay] = useState(String(state.session_count))
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCountDisplay(String(state.session_count)) }, [state.session_count])

  const branchConfig = branchName ? BRANCH_VOUCHER_CONFIG[branchName] : undefined
  const dynamicVoucherMethods: PaymentMethod[] = voucherConfig
    ? voucherConfig.map((c) => c.payment_method).filter((m) => !PRIMARY_SET.has(m as PaymentMethod)) as PaymentMethod[]
    : (branchConfig?.methods.filter((m) => !PRIMARY_SET.has(m)) ?? DEFAULT_VOUCHER_METHODS)
  const branchLimits: Partial<Record<PaymentMethod, number>> = voucherConfig
    ? voucherConfig.reduce((acc, c) => c.monthly_limit > 0 ? { ...acc, [c.payment_method]: c.monthly_limit } : acc, {})
    : (branchConfig?.limits ?? MONTHLY_SUPPORT_LIMITS)

  const gridCols = dynamicVoucherMethods.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'

  const toggleVoucher = (method: PaymentMethod) => {
    const current = state.secondary_methods
    if (current.includes(method)) {
      const next = current.filter((m) => m !== method)
      const nextOverrides = { ...state.secondary_overrides }
      delete nextOverrides[method]
      onChange({ secondary_methods: next, secondary_overrides: nextOverrides })
    } else {
      onChange({ secondary_methods: [...current, method] })
    }
  }

  return (
    <>
      {/* 요금 종류 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">요금 종류</p>
        <div className="grid grid-cols-2 gap-2">
          {feeTables.map((ft) => (
            <button
              key={ft.id}
              onClick={() => onChange({ fee_type: ft.fee_type, unit_price: ft.unit_price })}
              className={`py-2 px-3 rounded-lg text-sm font-medium text-left transition-colors
                ${state.fee_type === ft.fee_type
                  ? 'bg-[#e8f7fb] text-[#007a93] border border-[#00b4d8]'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'}`}
            >
              <span>{ft.fee_type}</span>
              <span className="text-xs text-gray-400 block">{formatKRW(ft.unit_price)}/회</span>
            </button>
          ))}
          <button
            onClick={() => onChange({ fee_type: '직접입력', unit_price: 0 })}
            className={`py-2 px-3 rounded-lg text-sm font-medium text-left transition-colors
              ${state.fee_type === '직접입력'
                ? 'bg-[#e8f7fb] text-[#007a93] border border-[#00b4d8]'
                : 'bg-gray-50 text-gray-600 border border-gray-200'}`}
          >
            직접입력
          </button>
        </div>
        {state.fee_type === '직접입력' && (
          <input
            type="number"
            inputMode="numeric"
            placeholder="1회 단가 입력 (원)"
            value={state.unit_price || ''}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
            onChange={(e) => onChange({ unit_price: Math.max(0, Number(e.target.value)) })}
            className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
          />
        )}
      </div>

      {/* 횟수 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          횟수{allowHalfSession && <span className="text-[#00b4d8] ml-1">(0.5 단위 가능)</span>}
        </p>
        {allowHalfSession ? (
          <input
            type="text"
            inputMode="decimal"
            placeholder="횟수 입력"
            value={countDisplay}
            onChange={(e) => {
              const text = e.target.value
              setCountDisplay(text)
              const num = parseFloat(text)
              if (!isNaN(num) && num > 0) onChange({ session_count: Math.max(0.5, Math.round(num * 2) / 2) })
            }}
            onBlur={(e) => {
              const n = Math.max(0.5, Math.round((parseFloat(e.target.value) || 0.5) * 2) / 2)
              setCountDisplay(String(n))
              onChange({ session_count: n })
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
          />
        ) : (
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="횟수 입력"
            value={state.session_count || ''}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
            onChange={(e) => {
              const n = Math.max(1, Math.round(Number(e.target.value) || 1))
              onChange({ session_count: n })
            }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
          />
        )}
      </div>

      {/* 결제 방식 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">결제 방식</p>
        <div className="grid grid-cols-4 gap-1.5">
          {PRIMARY_METHODS.map((key) => (
            <button
              key={key}
              onClick={() => onChange({ payment_method: key })}
              className={`py-2 rounded-lg text-xs font-medium transition-colors
                ${state.payment_method === key ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {PAYMENT_METHOD_LABELS[key as keyof typeof PAYMENT_METHOD_LABELS] ?? key}
            </button>
          ))}
        </div>
      </div>

      {/* 결제 방식 직접입력 메모 */}
      {state.payment_method === 'other' && (
        <input
          type="text"
          placeholder="결제 방식 입력 (예: 체크카드, 앱결제 등)"
          value={state.payment_note ?? ''}
          onChange={(e) => onChange({ payment_note: e.target.value })}
          className="w-full border border-[#00b4d8]/40 bg-[#e8f7fb]/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
        />
      )}

      {/* 지원금 바우처 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          지원금 바우처 <span className="text-gray-300">(복수 선택 가능)</span>
        </p>
        <div className={`grid ${gridCols} gap-1.5`}>
          {dynamicVoucherMethods.map((key) => (
            <button
              key={key}
              onClick={() => toggleVoucher(key)}
              className={`py-2 rounded-lg text-xs font-medium transition-colors
                ${state.secondary_methods.includes(key) ? 'bg-[#7db83a] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {PAYMENT_METHOD_LABELS[key as keyof typeof PAYMENT_METHOD_LABELS] ?? key}
            </button>
          ))}
        </div>
      </div>

      {/* 선택된 바우처별 입력 */}
      {state.secondary_methods.map((method) => {
        const limit = branchLimits[method]
        const hasLimit = !!limit
        return (
          <div key={method}>
            <p className="text-xs text-gray-400 mb-1.5">
              {PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method} 지원금
              {hasLimit ? (
                <span className="text-gray-300 ml-1">(빈 칸이면 월 {formatKRW(limit!)} 자동계산)</span>
              ) : (
                <span className="text-red-400 ml-1">직접입력 필수</span>
              )}
            </p>
            <input
              type="number"
              inputMode="numeric"
              placeholder={hasLimit ? `0 ~ ${(limit! / 10000).toFixed(0)}만원` : '지원금액 입력 (원)'}
              value={state.secondary_overrides[method] ?? ''}
              onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))
                onChange({ secondary_overrides: { ...state.secondary_overrides, [method]: val } })
              }}
              className="w-full border border-[#7db83a]/40 bg-[#f0f9e8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#7db83a]"
            />
          </div>
        )
      })}

      {/* 금액 미리보기 */}
      {total > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">총 요금</span>
            <span className="font-medium">{formatKRW(total)}</span>
          </div>
          {state.secondary_methods.map((method) => {
            const amt = voucherSupports[method] ?? 0
            if (amt <= 0) return null
            return (
              <div key={method} className="flex justify-between">
                <span className="text-[#7db83a]">{PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method} 지원금</span>
                <span className="text-[#7db83a]">−{formatKRW(amt)}</span>
              </div>
            )
          })}
          {totalSupport > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">지원금 합계</span>
              <span className="text-gray-400">−{formatKRW(totalSupport)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
            <span className="text-gray-700">자부담</span>
            <span className="text-gray-900">{formatKRW(selfPayment)}</span>
          </div>
          {remainingSupport > 0 && (
            <div className={`flex justify-between text-xs border-t pt-1.5 ${remainingSupport <= 20000 ? 'border-orange-200' : 'border-dashed border-gray-200'}`}>
              <span className={remainingSupport <= 20000 ? 'text-orange-500 font-semibold' : 'text-gray-400'}>
                남은지원금{remainingSupport <= 20000 ? ' ⚠︎' : ''}
              </span>
              <span className={remainingSupport <= 20000 ? 'text-orange-500 font-semibold' : 'text-gray-400'}>
                {formatKRW(remainingSupport)}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
