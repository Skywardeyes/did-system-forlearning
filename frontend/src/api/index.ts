import { api } from './client'
import type { CredentialSummary, DidSummary, Page, SensitiveAccessLog, StructuredLog, VerificationLog, VerificationResult } from '../types'

export const sessionApi = { local: () => api('/api/v2/session/local', { method: 'POST', body: '{}' }) }
export const didApi = {
  list: () => api<Page<DidSummary>>('/api/v2/dids?page=1&pageSize=50'),
  create: (body: object) => api<DidSummary>('/api/v2/dids', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: object) => api<DidSummary>(`/api/v2/dids/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  action: (id: string, action: 'rotate-key' | 'deactivate', expectedVersion: number) => api<DidSummary>(`/api/v2/dids/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }),
  registerHolder: (body: object) => api<DidSummary>('/api/v2/holder-dids/registration', { method: 'POST', body: JSON.stringify(body) }),
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
}
export const ledgerApi = {
  verification: () => api<Page<VerificationLog>>('/api/v2/verification-logs?page=1&pageSize=20'),
  disclosure: () => api<Page<VerificationLog>>('/api/v2/disclosure-verification-logs?page=1&pageSize=20'),
  structured: () => api<Page<StructuredLog>>('/api/v2/logs?page=1&pageSize=20'),
  sensitive: () => api<Page<SensitiveAccessLog>>('/api/v2/sensitive-access-logs?page=1&pageSize=20'),
}
