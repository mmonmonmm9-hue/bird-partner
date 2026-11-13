import type { AppDto, ChatMessageDto } from '@shared/types'

export class ApiError extends Error {
  status: number
  code: string
  data: Record<string, unknown>
  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.message === 'string' ? data.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
    this.status = status
    this.code = typeof data.error === 'string' ? data.error : 'error'
    this.data = data
  }
}

async function req<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'bird-web' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  let r: Response
  try {
    r = await fetch(`/api${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, { error: 'network', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' })
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new ApiError(r.status, data)
  return data as T
}

export const api = {
  get: <T,>(p: string) => req<T>('GET', p),
  post: <T,>(p: string, b?: unknown) => req<T>('POST', p, b ?? {}),
  del: <T,>(p: string) => req<T>('DELETE', p),
  upload: <T,>(p: string, file: File, extra: Record<string, string> = {}) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(extra)) f.append(k, v)
    f.append('file', file) // the file goes last so multer sees the text fields first
    return req<T>('POST', p, undefined, f)
  },
}

export interface Me {
  user: { email: string; role: 'partner' | 'admin' } | null
  ai: { configured: boolean; model: string }
}
export interface AppState {
  app: AppDto
  messages?: ChatMessageDto[]
  blockers: string[]
}
export interface AdminListItem {
  id: string; ref?: string; type: 'individual' | 'business'; status: string; email: string; submittedAt?: string; updatedAt: string; name: string; services: number
}
