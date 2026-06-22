import { supabase } from './supabase'
import { createAppError } from './appErrors'

/**
 * 이미지를 JPEG로 압축
 * 900px / 품질 0.72 → 약 80~100KB
 *
 * createImageBitmap 지원 브라우저: 메인 스레드 블로킹 없이 디코딩 + EXIF 회전 자동 적용
 * 미지원 브라우저(iOS Safari 16 이하 등): new Image() fallback
 */
async function compressImage(file: File): Promise<Blob> {
  const MAX_WIDTH = 900
  const QUALITY   = 0.72

  // createImageBitmap 지원 여부 확인
  if (typeof createImageBitmap !== 'undefined') {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      const scale = Math.min(1, MAX_WIDTH / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(bitmap.width  * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      bitmap = null
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', QUALITY)
      )
    } catch {
      bitmap?.close()
      // fallback으로 계속
    }
  }

  // Fallback: new Image() (iOS Safari 16 이하 등)
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', QUALITY)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

/**
 * 영수증 이미지 업로드
 * 저장 경로: receipts/{teacherId}/{recordId}.jpg
 * @returns 스토리지 경로 (예: teacherId/recordId.jpg)
 */
const MAX_FILE_SIZE_MB = 10
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function uploadReceipt(
  file: File,
  teacherId: string,
  recordId: string,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw createAppError('ERR-302')
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw createAppError('ERR-303')
  }

  let blob: Blob
  try {
    blob = await compressImage(file)
  } catch {
    throw createAppError('ERR-301')
  }
  const path = `${teacherId}/${recordId}.jpg`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

  if (error) throw createAppError('ERR-301', error.message)

  return path
}

/** 스토리지 경로 또는 레거시 공개 URL → 서명된 임시 URL (기본 1시간), 실패 시 null */
export async function getReceiptSignedUrl(pathOrUrl: string, expiresIn = 3600): Promise<string | null> {
  // 레거시 공개 URL에서 경로 추출: .../public/receipts/{path}
  const path = pathOrUrl.startsWith('http')
    ? (pathOrUrl.match(/\/receipts\/(.+)$/)?.[1] ?? pathOrUrl)
    : pathOrUrl
  const { data } = await supabase.storage.from('receipts').createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

/** 영수증 이미지 삭제 */
export async function deleteReceipt(teacherId: string, recordId: string): Promise<void> {
  await supabase.storage.from('receipts').remove([`${teacherId}/${recordId}.jpg`])
}
