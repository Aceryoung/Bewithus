export const APP_ERRORS = {
  'ERR-101': '건수 저장에 실패했습니다.',
  'ERR-102': '기록 수정에 실패했습니다.',
  'ERR-103': '기록 삭제에 실패했습니다.',
  'ERR-201': '데이터를 불러오지 못했습니다.',
  'ERR-301': '파일 업로드에 실패했습니다.',
  'ERR-302': '파일 크기는 10MB 이하만 가능합니다.',
  'ERR-303': '이미지 파일(JPG, PNG, WebP, HEIC)만 업로드 가능합니다.',
  'ERR-401': '호점이 배정되지 않은 계정입니다. 대표에게 문의하세요.',
} as const

export type AppErrorCode = keyof typeof APP_ERRORS

export interface AppError extends Error {
  appCode: AppErrorCode
}

export function createAppError(code: AppErrorCode, detail?: string): AppError {
  const err = new Error(detail ?? APP_ERRORS[code]) as AppError
  err.appCode = code
  return err
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof Error && 'appCode' in err
}
