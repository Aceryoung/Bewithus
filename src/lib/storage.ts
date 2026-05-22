import { supabase } from './supabase'

/**
 * 이미지를 JPEG로 압축
 * 영수증은 텍스트 판독 가능한 최소 품질로 압축
 * 900px / 품질 0.72 → 약 80~100KB (원본 대비 약 90% 절감)
 */
async function compressImage(file: File): Promise<Blob> {
  const MAX_WIDTH = 900
  const QUALITY   = 0.72
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', QUALITY)
    }
    img.src = url
  })
}

/**
 * 영수증 이미지 업로드
 * 저장 경로: receipts/{teacherId}/{recordId}.jpg
 * @returns 공개 URL (실패 시 null)
 */
export async function uploadReceipt(
  file: File,
  teacherId: string,
  recordId: string,
): Promise<string | null> {
  const blob = await compressImage(file)
  const path = `${teacherId}/${recordId}.jpg`

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

  if (error) return null

  return supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl
}

/** 영수증 이미지 삭제 */
export async function deleteReceipt(teacherId: string, recordId: string): Promise<void> {
  await supabase.storage.from('receipts').remove([`${teacherId}/${recordId}.jpg`])
}
