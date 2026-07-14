import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { credentialApi, didApi, ledgerApi } from '../api'
import type { CredentialSummary, DidSummary, VerificationLog } from '../types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const dids = ref<DidSummary[]>([])
  const credentials = ref<CredentialSummary[]>([])
  const verificationLogs = ref<VerificationLog[]>([])
  const loading = ref(false)
  const activeCredentials = computed(() => credentials.value.filter((item) => item.status === 'active'))

  async function refresh() {
    loading.value = true
    try {
      const [didPage, credentialPage, verificationPage] = await Promise.all([didApi.list(), credentialApi.list(), ledgerApi.verification()])
      dids.value = didPage.items
      credentials.value = credentialPage.items
      verificationLogs.value = verificationPage.items
    } finally { loading.value = false }
  }
  return { dids, credentials, verificationLogs, activeCredentials, loading, refresh }
})
