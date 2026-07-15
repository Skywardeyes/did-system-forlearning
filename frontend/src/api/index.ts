import { api } from './client'
import type { ChainDidRecord, CredentialSummary, CredentialTemplate, DidSummary, Page, SensitiveAccessLog, SessionInfo, StructuredLog, VerificationLog, VerificationPresentationLedger, VerificationResult } from '../types'

export const sessionApi = {
  local: () => api<SessionInfo>('/api/v2/session/local', { method: 'POST', body: '{}' }),
  register: (body: object) => api<SessionInfo>('/api/v2/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: object) => api<SessionInfo>('/api/v2/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => api<{ loggedOut: boolean }>('/api/v2/auth/logout', { method: 'POST', body: '{}' }),
}
export const didApi = {
  list: () => api<Page<DidSummary>>('/api/v2/dids?page=1&pageSize=50'),
  create: (body: object) => api<DidSummary>('/api/v2/dids', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: object) => api<DidSummary>(`/api/v2/dids/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  action: (id: string, action: 'rotate-key' | 'deactivate', expectedVersion: number) => api<DidSummary>(`/api/v2/dids/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }),
  registerHolder: (body: object) => api<DidSummary>('/api/v2/holder-dids/registration', { method: 'POST', body: JSON.stringify(body) }),
  linkPublishedHolder: (did: string) => api<DidSummary>('/api/v2/holder-dids/directory-link', { method: 'POST', body: JSON.stringify({ did }) }),
  holderRequests: () => api<{ items: Array<{ id: string; holderDid: string; holderDisplayName: string; message: string | null; status: 'pending' | 'accepted' | 'rejected'; createdAt: string }> }>('/api/v2/holder-requests'),
  decideHolderRequest: (id: string, decision: 'accept' | 'reject') => api(`/api/v2/holder-requests/${encodeURIComponent(id)}/${decision}`, { method: 'POST', body: '{}' }),
}
export const blockchainApi = {
  status: () => api<Pick<ChainDidRecord, 'enabled' | 'ready' | 'reason' | 'chainId' | 'contractAddress'>>('/api/v2/blockchain/status'),
  resolveDid: (id: string) => api<ChainDidRecord>(`/api/v2/blockchain/dids/${encodeURIComponent(id)}`),
  syncDid: (id: string) => api<ChainDidRecord>(`/api/v2/blockchain/dids/${encodeURIComponent(id)}/sync`, { method: 'POST', body: '{}' }),
  deactivateDid: (id: string) => api<ChainDidRecord>(`/api/v2/blockchain/dids/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: '{}' }),
}
export const credentialApi = {
  list: () => api<Page<CredentialSummary>>('/api/v2/credentials?page=1&pageSize=50'),
  issue: (body: object) => api<Record<string, unknown>>('/api/v2/credentials', { method: 'POST', body: JSON.stringify(body) }),
  action: (id: string, action: string, body: object = {}) => api(`/api/v2/credentials/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  content: (id: string, purpose: string) => api<{ credential: Record<string, unknown>; accessedAt: string }>(`/api/v2/credentials/${encodeURIComponent(id)}/content-access`, { method: 'POST', body: JSON.stringify({ purpose }) }),
  verify: (credential: object) => api<VerificationResult>('/api/v2/verify', { method: 'POST', body: JSON.stringify({ credential }) }),
  disclose: (id: string, paths: string[]) => api<Record<string, unknown>>(`/api/v2/credentials/${encodeURIComponent(id)}/disclosures`, { method: 'POST', body: JSON.stringify({ paths }) }),
  sdJwt: (id: string, paths: string[]) => api<{ sdJwt: string }>(`/api/v2/credentials/${encodeURIComponent(id)}/sd-jwt`, { method: 'POST', body: JSON.stringify({ paths }) }),
  walletPackage: (id: string) => api<Record<string, unknown>>(`/api/v2/credentials/${encodeURIComponent(id)}/wallet-package`, { method: 'POST', body: '{}' }),
  verifyDisclosure: (presentation: object) => api<VerificationResult>('/api/v2/disclosures/verify', { method: 'POST', body: JSON.stringify({ presentation }) }),
  verifySdJwt: (sdJwt: string) => api<VerificationResult>('/api/v2/sd-jwt/verify', { method: 'POST', body: JSON.stringify({ sdJwt }) }),
  createWalletChallenge: (body: { domain: string; ttlSeconds?: number }) => api<{ challenge: string; domain: string; expiresAt: string; ttlSeconds: number }>('/api/v2/wallet-challenges', { method: 'POST', body: JSON.stringify(body) }),
  verifyWalletPresentation: (presentation: object) => api<VerificationResult>('/api/v2/wallet-presentations/verify', { method: 'POST', body: JSON.stringify({ presentation }) }),
  walletPresentationLedger: () => api<Page<VerificationPresentationLedger>>('/api/v2/verification-presentations?page=1&pageSize=20'),
  latestNfcPresentation: () => api<{ transferId: string; holderDid: string; submittedAt: string; expiresAt: string; credentialCount: number } | null>('/api/v2/nfc/presentations/latest'),
  verifyNfcPresentation: (transferId: string) => api<VerificationResult>(`/api/v2/nfc/presentations/${encodeURIComponent(transferId)}/verify`, { method: 'POST', body: '{}' }),
}
export const credentialTemplateApi = {
  list: (status = '') => api<Page<CredentialTemplate>>(`/api/v2/credential-templates?page=1&pageSize=50${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  create: (body: object) => api<CredentialTemplate>('/api/v2/credential-templates', { method: 'POST', body: JSON.stringify(body) }),
  publish: (id: string) => api<CredentialTemplate>(`/api/v2/credential-templates/${encodeURIComponent(id)}/publish`, { method: 'POST', body: '{}' }),
  retire: (id: string) => api<CredentialTemplate>(`/api/v2/credential-templates/${encodeURIComponent(id)}/retire`, { method: 'POST', body: '{}' }),
  remove: (id: string) => api<{ id: string; deleted: true }>(`/api/v2/credential-templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
export const ledgerApi = {
  verification: () => api<Page<VerificationLog>>('/api/v2/verification-logs?page=1&pageSize=20'),
  disclosure: () => api<Page<VerificationLog>>('/api/v2/disclosure-verification-logs?page=1&pageSize=20'),
  structured: () => api<Page<StructuredLog>>('/api/v2/logs?page=1&pageSize=20'),
  sensitive: () => api<Page<SensitiveAccessLog>>('/api/v2/sensitive-access-logs?page=1&pageSize=20'),
}
