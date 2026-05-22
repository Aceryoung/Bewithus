import * as XLSX from 'xlsx'
import type { Record as SessionRecord } from '@/types'
import { ATTENDANCE_LABELS, PAYMENT_METHOD_LABELS } from '@/constants'

interface TeacherExportData {
  teacherName: string
  records: SessionRecord[]
  year: number
  month: number
}

function recordsToRows(records: SessionRecord[]) {
  return records.map((r) => ({
    '날짜':       r.date,
    '환자명':     r.patient_name,
    '출결':       ATTENDANCE_LABELS[r.attendance],
    '수가 종류':  r.fee_type,
    '횟수':       r.session_count,
    '단가 (원)':  r.attendance === 'absent' ? 0 : r.unit_price,
    '총 청구액':  r.attendance === 'absent' ? 0 : r.total_amount,
    '지원금':     r.support_amount,
    '자부담':     r.self_payment,
    '결제 방식':  PAYMENT_METHOD_LABELS[r.payment_method],
  }))
}

function summaryRow(records: SessionRecord[]) {
  return {
    '날짜':      '【합계】',
    '환자명':    '',
    '출결':      `총 ${records.length}건 / 출석 ${records.filter(r => r.attendance === 'present').length} / 결석 ${records.filter(r => r.attendance === 'absent').length} / 보강 ${records.filter(r => r.attendance === 'makeup').length}`,
    '수가 종류': '',
    '횟수':      records.reduce((a, r) => a + (r.attendance !== 'absent' ? r.session_count : 0), 0),
    '단가 (원)': '',
    '총 청구액': records.reduce((a, r) => a + r.total_amount, 0),
    '지원금':    records.reduce((a, r) => a + r.support_amount, 0),
    '자부담':    records.reduce((a, r) => a + r.self_payment, 0),
    '결제 방식': '',
  }
}

function applyColumnWidths(ws: XLSX.WorkSheet) {
  ws['!cols'] = [
    { wch: 12 }, // 날짜
    { wch: 12 }, // 환자명
    { wch: 10 }, // 출결
    { wch: 14 }, // 수가 종류
    { wch:  6 }, // 횟수
    { wch: 12 }, // 단가
    { wch: 12 }, // 총 청구액
    { wch: 12 }, // 지원금
    { wch: 12 }, // 자부담
    { wch: 14 }, // 결제 방식
  ]
}

/** 선생님 1명 월간 데이터를 엑셀로 다운로드 */
export function exportTeacherMonthly({ teacherName, records, year, month }: TeacherExportData) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const rows = [...recordsToRows(sorted), summaryRow(sorted)]

  const ws = XLSX.utils.json_to_sheet(rows)
  applyColumnWidths(ws)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${month}월 건수`)

  const filename = `${teacherName}_${year}년${month}월_건수.xlsx`
  XLSX.writeFile(wb, filename)
}

/** 전체 선생님 월간 데이터를 시트별로 통합 다운로드 */
export function exportAllTeachersMonthly(
  teachers: TeacherExportData[],
  year: number,
  month: number,
) {
  const wb = XLSX.utils.book_new()

  // 요약 시트
  const summaryRows = teachers.map(({ teacherName, records }) => ({
    '선생님':    teacherName,
    '총 건수':   records.length,
    '출석':      records.filter(r => r.attendance === 'present').length,
    '결석':      records.filter(r => r.attendance === 'absent').length,
    '보강':      records.filter(r => r.attendance === 'makeup').length,
    '총 청구액': records.reduce((a, r) => a + r.total_amount, 0),
    '지원금':    records.reduce((a, r) => a + r.support_amount, 0),
    '자부담':    records.reduce((a, r) => a + r.self_payment, 0),
  }))
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
  summaryWs['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, summaryWs, '전체 요약')

  // 선생님별 시트
  for (const { teacherName, records } of teachers) {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
    const rows = [...recordsToRows(sorted), summaryRow(sorted)]
    const ws = XLSX.utils.json_to_sheet(rows)
    applyColumnWidths(ws)
    XLSX.utils.book_append_sheet(wb, ws, teacherName)
  }

  const filename = `비위더스_${year}년${month}월_전체건수.xlsx`
  XLSX.writeFile(wb, filename)
}
