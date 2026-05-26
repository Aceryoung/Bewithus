const PREFIX = 'bewithus-draft'

export function saveDraft<T>(userId: string, key: string, data: T): void {
  try {
    localStorage.setItem(`${PREFIX}-${userId}-${key}`, JSON.stringify({ data, savedAt: Date.now() }))
  } catch { /* storage full 등 무시 */ }
}

export function loadDraft<T>(userId: string, key: string): { data: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}-${userId}-${key}`)
    if (!raw) return null
    return JSON.parse(raw) as { data: T; savedAt: number }
  } catch { return null }
}

export function clearDraft(userId: string, key: string): void {
  try {
    localStorage.removeItem(`${PREFIX}-${userId}-${key}`)
  } catch { /* 무시 */ }
}
