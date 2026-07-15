import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { platformApi, sessionApi } from '../api'
import { setAccessToken } from '../api/client'
import type { SessionInfo, WorkspaceSummary } from '../types'

const storageKey = 'did-vc-session-v2'

export const useSessionStore = defineStore('session', () => {
  const session = ref<SessionInfo | null>(null)
  const workspaces = ref<WorkspaceSummary[]>([])
  const platformRoles = ref<string[]>([])
  const loading = ref(false)
  const initialized = ref(false)
  const error = ref('')
  const authenticated = computed(() => Boolean(session.value?.accessToken))

  async function initialize() {
    if (initialized.value) return
    initialized.value = true
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return
    try {
      const restored = JSON.parse(raw) as SessionInfo
      if (!isCompleteSession(restored)) throw new Error('Stored session is incomplete')
      applySession(restored)
      await refreshEntitlements()
    } catch { clear() }
  }

  async function login(email: string, password: string) {
    return run(() => sessionApi.login({ email, password }))
  }

  async function register(input: object) {
    return run(() => sessionApi.register(input))
  }

  async function switchWorkspace(tenantId: string) {
    return run(() => sessionApi.switchWorkspace(tenantId))
  }

  async function logout() {
    try { if (authenticated.value) await sessionApi.logout() } finally { clear() }
  }

  async function run(operation: () => Promise<SessionInfo>) {
    loading.value = true; error.value = ''
    try { const value = await operation(); applySession(value); await refreshEntitlements(); return value }
    catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败'; throw reason }
    finally { loading.value = false }
  }

  function applySession(value: SessionInfo) {
    if (!isCompleteSession(value)) throw new Error('服务器返回了不完整的会话信息，请重新登录')
    session.value = value
    workspaces.value = value.workspaces || workspaces.value
    setAccessToken(value.accessToken)
    sessionStorage.setItem(storageKey, JSON.stringify(value))
  }

  async function refreshEntitlements() {
    const [workspaceResult, platformResult] = await Promise.all([sessionApi.workspaces(), platformApi.me()])
    workspaces.value = workspaceResult.workspaces; platformRoles.value = platformResult.roles
  }

  function clear() {
    setAccessToken(null); session.value = null; workspaces.value = []; platformRoles.value = []
    sessionStorage.removeItem(storageKey)
  }

  return { session, workspaces, platformRoles, loading, initialized, error, authenticated, initialize, login, register, switchWorkspace, logout, clear }
})

function isCompleteSession(value: unknown): value is SessionInfo {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SessionInfo>
  return typeof candidate.accessToken === 'string' && candidate.accessToken.length > 0
    && typeof candidate.actor?.id === 'string' && candidate.actor.id.length > 0
    && typeof candidate.tenant?.id === 'string' && candidate.tenant.id.length > 0
    && Array.isArray(candidate.roles)
}
