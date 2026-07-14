import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { sessionApi } from '../api'
import { setAccessToken } from '../api/client'
import type { SessionInfo } from '../types'

export const useSessionStore = defineStore('session', () => {
  const session = ref<SessionInfo | null>(null)
  const loading = ref(false)
  const error = ref('')
  const authenticated = computed(() => Boolean(session.value?.accessToken))

  async function initializeLocalDemo() {
    if (loading.value || authenticated.value) return
    loading.value = true; error.value = ''
    try {
      const value = await sessionApi.local() as SessionInfo
      session.value = value
      setAccessToken(value.accessToken)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '无法建立会话'
      throw reason
    } finally { loading.value = false }
  }

  function clear() { setAccessToken(null); session.value = null }
  return { session, loading, error, authenticated, initializeLocalDemo, clear }
})
