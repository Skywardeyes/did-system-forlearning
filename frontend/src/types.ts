export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export interface DidSummary {
  id: string; did: string; name: string; method: 'example' | 'key'; role: 'issuer' | 'holder';
  status: string; version: number; keyVersion: number; document: Record<string, unknown>;
  capabilities: { update: boolean; rotateKey: boolean; deactivate: boolean };
  keyCustody: 'holder_self_custody' | 'issuer_managed_kms' | 'legacy_demo_custody';
}

export interface CredentialSummary {
  id: string; status: string; issuerDidId: string; holderDidId: string; issuedAt: string;
  validFrom: string; validUntil: string; rowVersion: number; contentProtected: true;
  selectiveDisclosureAvailable: boolean; sdJwtAvailable: boolean;
}

export interface VerificationCheck { key: string; label: string; passed: boolean; detail: string }
export interface VerificationResult { valid: boolean; credentialId: string | null; checkedAt: string; checks: VerificationCheck[] }
export interface VerificationLog { id: string; credentialId: string | null; valid: boolean; checkedAt: string; format: string; failedChecks: string[]; disclosedPaths: string[] }
export interface StructuredLog { id: string; occurredAt: string; level: string; module: string; action: string; success: boolean; message: string }
export interface SensitiveAccessLog { id: string; actorId: string; credentialId: string; purposeCode: string; correlationId: string | null; occurredAt: string }
export interface SessionInfo {
  mode: 'v2'; accessToken: string; expiresAt: string; actor: { id: string; externalSubject: string };
  tenant: { id: string; name: string }; roles: string[];
}
