let accessToken: string | null = null

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message) }
}

export function setAccessToken(token: string | null) { accessToken = token }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
  const text = await response.text()
  let body: Record<string, unknown> = {}
  if (text) {
    try { body = JSON.parse(text) as Record<string, unknown> } catch { body = { error: text } }
  }
  if (!response.ok) throw new ApiError(String(body.error || '请求失败'), response.status, body.code ? String(body.code) : undefined)
  return body as T
}
