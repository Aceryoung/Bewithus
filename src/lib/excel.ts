import ExcelJS from 'exceljs'
import type { Record as SessionRecord } from '@/types'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'

const COLUMNS = [
  { header: '날짜',       key: 'date',           width: 13 },
  { header: '환자명',     key: 'patient_name',   width: 13 },
  { header: '출결',       key: 'attendance',     width: 8  },
  { header: '수가 종류',  key: 'fee_type',       width: 14 },
  { header: '횟수',       key: 'session_count',  width: 7  },
  { header: '단가 (원)',  key: 'unit_price',     width: 13 },
  { header: '총 청구액',  key: 'total_amount',   width: 13 },
  { header: '지원금',     key: 'support_amount', width: 13 },
  { header: '자부담',     key: 'self_payment',   width: 13 },
  { header: '결제 방식',  key: 'payment_method', width: 14 },
]

function toRows(records: SessionRecord[]) {
  return records.map((r) => ({
    date:           r.date,
    patient_name:   r.patient_name,
    attendance:     ATTENDANCE_LABELS[r.attendance],
    fee_type:       r.fee_type,
    session_count:  r.attendance === 'absent' ? 0 : r.session_count,
    unit_price:     r.attendance === 'absent' ? 0 : r.unit_price,
    total_amount:   r.total_amount,
    support_amount: r.support_amount,
    self_payment:   r.self_payment,
    payment_method: PAYMENT_METHOD_LABELS[r.payment_method],
  }))
}

function addSummaryRow(ws: ExcelJS.Worksheet, records: SessionRecord[]) {
  const summary = ws.addRow({
    date:           '【합계】',
    patient_name:   `총 ${records.length}건 / 출석 ${records.filter(r => r.attendance === 'present').length} / 결석 ${records.filter(r => r.attendance === 'absent').length} / 보강 ${records.filter(r => r.attendance === 'makeup').length}`,
    attendance:     '',
    fee_type:       '',
    session_count:  records.reduce((a, r) => a + (r.attendance !== 'absent' ? r.session_count : 0), 0),
    unit_price:     '',
    total_amount:   records.reduce((a, r) => a + r.total_amount, 0),
    support_amount: records.reduce((a, r) => a + r.support_amount, 0),
    self_payment:   records.reduce((a, r) => a + r.self_payment, 0),
    payment_method: '',
  })
  summary.font = { bold: true }
  summary.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F7FB' } }
}

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF007A93' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.height = 20
}

function buildSheet(wb: ExcelJS.Workbook, sheetName: string, records: SessionRecord[]) {
  const ws = wb.addWorksheet(sheetName)
  ws.columns = COLUMNS as ExcelJS.Column[]
  styleHeaderRow(ws)
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  toRows(sorted).forEach((r) => ws.addRow(r))
  addSummaryRow(ws, sorted)
  return ws
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

/** 선생님 1명 월간 데이터 엑셀 다운로드 */
export async function exportTeacherMonthly({
  teacherName,
  records,
  year,
  month,
}: {
  teacherName: string
  records: SessionRecord[]
  year: number
  month: number
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '비위더스 EMR'
  buildSheet(wb, `${month}월 건수`, records)
  await download(wb, `${teacherName}_${year}년${month}월_건수.xlsx`)
}

/** 전체 선생님 통합 엑셀 다운로드 (요약 + 선생님별 시트) */
export async function exportAllTeachersMonthly(
  teachers: { teacherName: string; records: SessionRecord[] }[],
  year: number,
  month: number,
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '비위더스 EMR'

  // 요약 시트
  const summaryWs = wb.addWorksheet('전체 요약')
  summaryWs.columns = [
    { header: '선생님',    key: 'name',    width: 12 },
    { header: '총 건수',   key: 'total',   width: 9  },
    { header: '출석',      key: 'present', width: 7  },
    { header: '결석',      key: 'absent',  width: 7  },
    { header: '보강',      key: 'makeup',  width: 7  },
    { header: '총 청구액', key: 'amount',  width: 13 },
    { header: '지원금',    key: 'support', width: 13 },
    { header: '자부담',    key: 'self',    width: 13 },
  ] as ExcelJS.Column[]
  styleHeaderRow(summaryWs)

  teachers.forEach(({ teacherName, records }) => {
    summaryWs.addRow({
      name:    teacherName,
      total:   records.length,
      present: records.filter(r => r.attendance === 'present').length,
      absent:  records.filter(r => r.attendance === 'absent').length,
      makeup:  records.filter(r => r.attendance === 'makeup').length,
      amount:  records.reduce((a, r) => a + r.total_amount, 0),
      support: records.reduce((a, r) => a + r.support_amount, 0),
      self:    records.reduce((a, r) => a + r.self_payment, 0),
    })
    buildSheet(wb, teacherName, records)
  })

  await download(wb, `비위더스_${year}년${month}월_전체건수.xlsx`)
}
