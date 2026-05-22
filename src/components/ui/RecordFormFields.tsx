import type { PaymentMethod, FeeTable } from '@/types'
import { formatKRW } from '@/lib/utils'
import { PAYMENT_METHOD_LABELS, SESSION_OPTIONS, MONTHLY_SUPPORT_LIMITS } from '@/constants'

export interface RecordFieldState {
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  after_school_support?: number
}

interface Props {
  state: RecordFieldState
  feeTables: FeeTable[]
  total: number
  support: number
  selfPayment: number
  onChange: (updates: Partial<RecordFieldState>) => void
}

export default function RecordFormFields({ state, feeTables, total, support, selfPayment, onChange }: Props) {
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
            onChange={(e) => onChange({ unit_price: Number(e.target.value) })}
            className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
          />
        )}
      </div>

      {/* 횟수 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">횟수</p>
        <div className="flex gap-1.5 flex-wrap">
          {SESSION_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => onChange({ session_count: n })}
              className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors
                ${state.session_count === n ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 결제 방식 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">결제 방식</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() =>
                onChange({
                  payment_method: key,
                  after_school_support: key === 'after_school' ? state.after_school_support : undefined,
                })
              }
              className={`py-2 rounded-lg text-xs font-medium transition-colors
                ${state.payment_method === key ? 'bg-[#00b4d8] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 방과후 지원금 직접입력 */}
      {state.payment_method === 'after_school' && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">
            방과후 지원금 직접입력
            <span className="text-gray-300 ml-1">
              (빈 칸이면 월 {formatKRW(MONTHLY_SUPPORT_LIMITS.after_school!)} 자동계산)
            </span>
          </p>
          <input
            type="number"
            inputMode="numeric"
            placeholder={`0 ~ ${(MONTHLY_SUPPORT_LIMITS.after_school! / 10000).toFixed(0)}만원`}
            value={state.after_school_support ?? ''}
            onChange={(e) =>
              onChange({
                after_school_support: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className="w-full border border-orange-200 bg-orange-50 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </div>
      )}

      {/* 금액 미리보기 */}
      {total > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">총 요금</span>
            <span className="font-medium">{formatKRW(total)}</span>
          </div>
          {support > 0 && (
            <div className="flex justify-between">
              <span className="text-[#00b4d8]">지원금</span>
              <span className="text-[#00b4d8]">−{formatKRW(support)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
            <span className="text-gray-700">자부담</span>
            <span className="text-gray-900">{formatKRW(selfPayment)}</span>
          </div>
        </div>
      )}
    </>
  )
}
