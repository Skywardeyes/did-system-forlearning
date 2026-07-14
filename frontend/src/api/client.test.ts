import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, setAccessToken } from './client'

describe('secure API client', () => {
  afterEach(() => { setAccessToken(null); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })

  it('keeps the bearer token in memory and sends it only as an authorization header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    setAccessToken('short-lived-test-token')
    await api('/api/v2/dids')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer short-lived-test-token')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(init.cache).toBe('no-store')
  })
})
