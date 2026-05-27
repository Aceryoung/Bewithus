import ExcelJS from 'exceljs'
import type { Record as SessionRecord } from '@/types'

/* ── 결제방식별 행 배경색 ── */
const ROW_COLORS: Record<string, string> = {
  card:          'FFD6EEF8',
  cash:          'FFFFFF99',
  bank_transfer: 'FFFFFF99',
  after_school:  'FFD5E8C8',
  education:     'FFE0D5ED',
  sports_voucher:'FFFFD5D5',
  developmental: 'FFDDEEFF',
  disabled_sports:'FFE8DDFF',
  other:         'FFFFFFFF',
}

/* ── 바우처 열 정의 ── */
const VOUCHER_COLUMN_ORDER = [
  'education', 'sports_voucher', 'after_school',
  'developmental', 'disabled_sports', 'senior_voucher', 'sci_rehab', 'after_school_fee',
] as const

const VOUCHER_COLUMN_LABELS: Record<string, string> = {
  education:      '교육청',
  sports_voucher: '바우처',
  after_school:   '방과후',
  developmental:  '발달바우처',
  disabled_sports:'장애인스포츠',
  senior_voucher: '노인바우처',
  sci_rehab:      'SCI재활',
  after_school_fee:'방과후수강료',
}

const PRIMARY_METHODS = new Set(['card', 'cash', 'bank_transfer', 'other'])

/** 한 환자의 월 집계 */
interface PatientRow {
  name: string
  pendingMakeup: number | ''
  makeupDone: number
  count: number
  totalAmount: number
  selfPayment: number
  lastDate: string
  vouchers: Record<string, number>
  remainingSupport: number
  primaryMethod: string
}

function buildPatientRows(
  records: SessionRecord[],
  pendingMakeups: { [name: string]: number } = {},
): PatientRow[] {
  const groups: Record<string, SessionRecord[]> = {}
  for (const r of records) {
    if (!groups[r.patient_name]) groups[r.patient_name] = []
    groups[r.patient_name].push(r)
  }

  return Object.entries(groups).map(([name, rows]) => {
    const present = rows.filter((r) => r.attendance === 'present')
    const makeup  = rows.filter((r) => r.attendance === 'makeup')

    const methodCount: Record<string, number> = {}
    for (const r of rows) methodCount[r.payment_method] = (methodCount[r.payment_method] ?? 0) + 1
    const primaryMethod = Object.entries(methodCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'

    /* 바우처별 지원금 집계 */
    const vouchers: Record<string, number> = {}
    for (const r of rows) {
      const slots: [string | null, number][] = [
        // 구형: payment_method가 바우처인 경우
        !PRIMARY_METHODS.has(r.payment_method)
          ? [r.payment_method, r.support_amount - (r.secondary_support ?? 0) - (r.tertiary_support ?? 0)]
          : [null, 0],
        [r.secondary_method, r.secondary_support ?? 0],
        [r.tertiary_method, r.tertiary_support ?? 0],
      ]
      for (const [method, amount] of slots) {
        if (method && amount > 0) vouchers[method] = (vouchers[method] ?? 0) + amount
      }
    }

    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
    const remainingSupport = sorted[0]?.remaining_support ?? 0
    const lastDate = sorted[0]?.date ?? ''
    const [, m, d] = lastDate.split('-')
    const dateLabel = lastDate ? `${parseInt(m)}월 ${parseInt(d)}일` : ''

    return {
      name,
      pendingMakeup: pendingMakeups[name] ?? '',
      makeupDone:   makeup.length,
      count:        present.length,
      totalAmount:  rows.reduce((a, r) => a + r.total_amount, 0),
      selfPayment:  rows.reduce((a, r) => a + r.self_payment, 0),
      lastDate:     dateLabel,
      vouchers,
      remainingSupport,
      primaryMethod,
    }
  })
}

function applyRowColor(row: ExcelJS.Row, method: string) {
  const argb = ROW_COLORS[method] ?? 'FFFFFFFF'
  if (argb === 'FFFFFFFF') return
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  })
}

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  teacherName: string,
  records: SessionRecord[],
  _year: number,
  month: number,
  pendingMakeups: { [name: string]: number } = {},
) {
  const ws = wb.addWorksheet(sheetName)
  const patientRows = buildPatientRows(records, pendingMakeups)

  /* 이 시트의 기록에서 실제 사용된 바우처만 표시 */
  const usedVouchers = VOUCHER_COLUMN_ORDER.filter((v) =>
    patientRows.some((p) => (p.vouchers[v] ?? 0) > 0)
  )

  const totalCols = 7 + usedVouchers.length + 2 // 고정 7 + 바우처 + 남은지원금 + 비고
  const lastColLetter = String.fromCharCode(64 + totalCols)

  /* 월 제목 행 */
  ws.mergeCells(`A1:${lastColLetter}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = `${month}월`
  titleCell.font = { bold: true, size: 13 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
  ws.getRow(1).height = 22

  /* 컬럼 정의 */
  const columns: ExcelJS.Column[] = [
    { key: 'name',          width: 10 },
    { key: 'pendingMakeup', width: 9  },
    { key: 'makeupDone',    width: 7  },
    { key: 'count',         width: 7  },
    { key: 'totalAmount',   width: 12 },
    { key: 'selfPayment',   width: 12 },
    { key: 'lastDate',      width: 11 },
    ...usedVouchers.map((v) => ({ key: v, width: 11 })),
    { key: 'remaining',     width: 11 },
    { key: 'note',          width: 20 },
  ] as ExcelJS.Column[]
  ws.columns = columns

  const headers = [
    '이름', '남은보강', '보강', '건수', '건수금액', '결제금액', '날짜',
    ...usedVouchers.map((v) => VOUCHER_COLUMN_LABELS[v]),
    '남은지원금', '비고',
  ]
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B4D8' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF007A93' } } }
  })
  headerRow.height = 18

  /* 환자 행 */
  for (const p of patientRows) {
    const voucherValues = usedVouchers.map((v) => p.vouchers[v] || '')
    const row = ws.addRow([
      p.name,
      p.pendingMakeup,
      p.makeupDone || '',
      p.count || '',
      p.totalAmount || '',
      p.selfPayment === 0 ? '₩0' : p.selfPayment,
      p.lastDate,
      ...voucherValues,
      p.remainingSupport || '',
      '',
    ])

    /* 금액 셀 포맷: totalAmount(5), selfPayment(6), voucher cols, remaining */
    const amountColIndices = [5, 6, ...usedVouchers.map((_, i) => 8 + i), 8 + usedVouchers.length]
    amountColIndices.forEach((col) => {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number' && cell.value !== 0) cell.numFmt = '₩#,##0'
    })

    row.alignment = { vertical: 'middle' }
    applyRowColor(row, p.primaryMethod)
  }

  /* 총합 행 */
  const makeupTotal = patientRows.reduce((a, r) => a + r.makeupDone, 0)
  const countTotal  = patientRows.reduce((a, r) => a + r.count, 0)
  const amountTotal = patientRows.reduce((a, r) => a + r.totalAmount, 0)

  ws.addRow([])

  const totalRow = ws.addRow([
    '총합', `보강총합`, makeupTotal, `실적총합`, countTotal, amountTotal,
    '', ...usedVouchers.map(() => ''), '', '',
  ])
  totalRow.font = { bold: true }
  totalRow.getCell(6).numFmt = '₩#,##0'
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F0F5' } }

  const grandRow = ws.addRow([
    `${teacherName} 총실적`, makeupTotal + countTotal,
    '', '', '', '', '', ...usedVouchers.map(() => ''), '', '',
  ])
  grandRow.font = { bold: true, color: { argb: 'FF007A93' } }

  return ws
}

/** 컬러 범례 시트 */
function addLegendSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('범례')
  ws.columns = [{ key: 'label', width: 16 }, { key: 'desc', width: 20 }] as ExcelJS.Column[]
  const legend = [
    { argb: ROW_COLORS.card,           label: '카드결제' },
    { argb: ROW_COLORS.bank_transfer,  label: '현금이체' },
    { argb: ROW_COLORS.after_school,   label: '방과후결제' },
    { argb: ROW_COLORS.education,      label: '교육청카드결제' },
    { argb: ROW_COLORS.sports_voucher, label: '바우처결제' },
    { argb: ROW_COLORS.developmental,  label: '발달바우처' },
    { argb: ROW_COLORS.disabled_sports,label: '장애인스포츠' },
    { argb: 'FFFFFFFF',                label: '현금영수증/기타' },
  ]
  for (const item of legend) {
    const row = ws.addRow([item.label, ''])
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.argb } }
    row.getCell(1).font = { bold: true }
    row.height = 18
  }
}

async function download(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 선생님 1명 월간 요약 엑셀 */
export async function exportTeacherMonthly({
  teacherName,
  records,
  year,
  month,
  pendingMakeups = {},
}: {
  teacherName: string
  records: SessionRecord[]
  year: number
  month: number
  pendingMakeups?: Record<string, number>
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '비위더스 EMR'
  buildSummarySheet(wb, `${month}월 건수`, teacherName, records, year, month, pendingMakeups)
  addLegendSheet(wb)
  await download(wb, `${teacherName}_${year}년${month}월_건수.xlsx`)
}

/** 전체 선생님 통합 엑셀 (선생님별 시트 + 전체 요약) */
export async function exportAllTeachersMonthly(
  teachers: { teacherName: string; records: SessionRecord[]; pendingMakeups?: Record<string, number> }[],
  year: number,
  month: number,
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '비위더스 EMR'

  /* 전체 요약 시트 */
  const summaryWs = wb.addWorksheet('전체 요약')
  summaryWs.columns = [
    { key: 'name',    width: 12 },
    { key: 'count',   width: 9  },
    { key: 'present', width: 7  },
    { key: 'makeup',  width: 7  },
    { key: 'amount',  width: 13 },
    { key: 'support', width: 13 },
    { key: 'self',    width: 13 },
  ] as ExcelJS.Column[]

  const hRow = summaryWs.addRow(['선생님', '총건수', '출석', '보강', '총청구액', '지원금', '자부담'])
  hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF007A93' } }
  hRow.alignment = { horizontal: 'center', vertical: 'middle' }

  for (const { teacherName, records } of teachers) {
    const row = summaryWs.addRow({
      name:    teacherName,
      count:   records.length,
      present: records.filter((r) => r.attendance === 'present').length,
      makeup:  records.filter((r) => r.attendance === 'makeup').length,
      amount:  records.reduce((a, r) => a + r.total_amount, 0),
      support: records.reduce((a, r) => a + r.support_amount, 0),
      self:    records.reduce((a, r) => a + r.self_payment, 0),
    })
    ;[5, 6, 7].forEach((c) => { row.getCell(c).numFmt = '₩#,##0' })

    buildSummarySheet(wb, teacherName, teacherName, records, year, month, teachers.find((t) => t.teacherName === teacherName)?.pendingMakeups ?? {})
  }

  addLegendSheet(wb)
  await download(wb, `비위더스_${year}년${month}월_전체건수.xlsx`)
}
