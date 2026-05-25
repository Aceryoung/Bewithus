import type { PaymentMethod, FeeTable } from '@/types'
import { formatKRW } from '@/lib/utils'
import { PAYMENT_METHOD_LABELS, MONTHLY_SUPPORT_LIMITS } from '@/constants'

export interface RecordFieldState {
  fee_type: string
  unit_price: number
  session_count: number
  payment_method: PaymentMethod
  after_school_support?: number
  sports_voucher_support?: number
  secondary_method?: PaymentMethod
  secondary_override?: number
  payment_note?: string
}

interface Props {
  state: RecordFieldState
  feeTables: FeeTable[]
  total: number
  support: number          // 총 지원금 (primary + secondary)
  secondarySupport?: number
  remainingSupport?: number // 자동 계산된 남은지원금
  selfPayment: number
  onChange: (updates: Partial<RecordFieldState>) => void
}

export default function RecordFormFields({ state, feeTables, total, support, secondarySupport, remainingSupport, selfPayment, onChange }: Props) {
  const primarySupport = support - (secondarySupport ?? 0)

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

      {/* 횟수 직접입력 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">횟수</p>
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
      </div>

      {/* 결제 방식 (primary) */}
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
                  sports_voucher_support: key === 'sports_voucher' ? state.sports_voucher_support : undefined,
                  secondary_method: state.secondary_method === key ? undefined : state.secondary_method,
                  secondary_override: state.secondary_method === key ? undefined : state.secondary_override,
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

      {/* 결제 방식 직접입력 메모 */}
      {state.payment_method === 'other' && (
        <input
          type="text"
          placeholder="결제 방식 입력 (예: 국가바우처, 지자체지원 등)"
          value={state.payment_note ?? ''}
          onChange={(e) => onChange({ payment_note: e.target.value })}
          className="w-full border border-[#00b4d8]/40 bg-[#e8f7fb]/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#00b4d8]"
        />
      )}

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
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
            onChange={(e) =>
              onChange({
                after_school_support:
                  e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
              })
            }
            className="w-full border border-orange-200 bg-orange-50 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
        </div>
      )}

      {/* 스포츠바우처 지원금 직접입력 */}
      {state.payment_method === 'sports_voucher' && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">
            스포츠바우처 지원금 직접입력
            <span className="text-gray-300 ml-1">
              (빈 칸이면 월 {formatKRW(MONTHLY_SUPPORT_LIMITS.sports_voucher!)} 자동계산)
            </span>
          </p>
          <input
            type="number"
            inputMode="numeric"
            placeholder={`0 ~ ${(MONTHLY_SUPPORT_LIMITS.sports_voucher! / 10000).toFixed(0)}만원`}
            value={state.sports_voucher_support ?? ''}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
            onChange={(e) =>
              onChange({
                sports_voucher_support:
                  e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
              })
            }
            className="w-full border border-purple-200 bg-purple-50 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
        </div>
      )}

      {/* 보조 결제방식 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">보조 결제방식 <span className="text-gray-300">(선택)</span></p>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => onChange({ secondary_method: undefined, secondary_override: undefined })}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
              ${!state.secondary_method ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            없음
          </button>
          {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][])
            .filter(([key]) => key !== state.payment_method)
            .map(([key, label]) => (
              <button
                key={key}
                onClick={() => onChange({ secondary_method: key, secondary_override: undefined })}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${state.secondary_method === key ? 'bg-[#7db83a] text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {/* 보조 결제방식 직접입력 (after_school / sports_voucher) */}
      {state.secondary_method && (state.secondary_method === 'after_school' || state.secondary_method === 'sports_voucher') && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">
            {PAYMENT_METHOD_LABELS[state.secondary_method]} 지원금 직접입력
            <span className="text-gray-300 ml-1">(빈 칸이면 자동계산)</span>
          </p>
          <input
            type="number"
            inputMode="numeric"
            placeholder="지원금 금액"
            value={state.secondary_override ?? ''}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
            onChange={(e) =>
              onChange({
                secondary_override:
                  e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
              })
            }
            className="w-full border border-[#7db83a]/40 bg-[#f0f9e8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#7db83a]"
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
          {primarySupport > 0 && (
            <div className="flex justify-between">
              <span className="text-[#00b4d8]">{PAYMENT_METHOD_LABELS[state.payment_method]} 지원금</span>
              <span className="text-[#00b4d8]">−{formatKRW(primarySupport)}</span>
            </div>
          )}
          {(secondarySupport ?? 0) > 0 && state.secondary_method && (
            <div className="flex justify-between">
              <span className="text-[#7db83a]">{PAYMENT_METHOD_LABELS[state.secondary_method]} 지원금</span>
              <span className="text-[#7db83a]">−{formatKRW(secondarySupport!)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1.5">
            <span className="text-gray-700">자부담</span>
            <span className="text-gray-900">{formatKRW(selfPayment)}</span>
          </div>
          {(remainingSupport ?? 0) > 0 && (
            <div className="flex justify-between text-xs border-t border-dashed border-gray-200 pt-1.5">
              <span className="text-gray-400">남은지원금</span>
              <span className="text-gray-400">{formatKRW(remainingSupport!)}</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
