export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export interface DidSummary {
  id: string; did: string; name: string; method: 'example' | 'key'; role: 'issuer' | 'holder';
  status: string; version: number; keyVersion: number; document: Record<string, unknown>;
  capabilities: { update: boolean; rotateKey: boolean; deactivate: boolean };
  keyCustody: 'holder_self_custody' | 'issuer_managed_kms' | 'legacy_demo_custody';
}

export interface ChainDidRecord {
  enabled: boolean; ready?: boolean; reason?: string; did: string; didHash: string; registered: boolean;
  controller?: string; documentHash?: string; version?: number; deactivated?: boolean; updatedAt?: number | null;
  transactionHash?: string; blockNumber?: number; chainId?: string; contractAddress?: string;
}

export interface CredentialSummary {
  id: string; status: string; issuerDidId: string; holderDidId: string; issuedAt: string;
  validFrom: string; validUntil: string; rowVersion: number; contentProtected: true;
  selectiveDisclosureAvailable: boolean; sdJwtAvailable: boolean;
  templateId?: string | null; templateVersion?: number | null; schemaHash?: string | null;
  templateName: string; credentialType?: string | null;
  issuerName: string; issuerDid?: string | null; holderName: string; holderDid?: string | null;
}

export interface CredentialTemplateField { key: string; label: string; type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum'; required: boolean; order: number; options?: string[] }
export interface CredentialTemplate { id: string; name: string; credentialType: string; version: number; status: 'draft' | 'published' | 'retired'; schemaHash: string; schema: { name: string; credentialType: string; fields: CredentialTemplateField[] } }

export interface VerificationCheck { key: string; label: string; passed: boolean; detail: string }
export interface VerifiedPresentationCredential {
  credentialId: string | null; issuerDid: string | null; credentialType: string | null;
  templateName?: string | null; outcome: 'valid' | 'invalid'; disclosedPaths: string[];
  disclosedClaims?: Array<{ path: string; key: string; label: string; value: string | number | boolean }>;
  failedChecks: string[];
}
export interface VerificationResult {
  valid: boolean; presentationId?: string; credentialId: string | null; checkedAt: string;
  checks: VerificationCheck[]; disclosedPaths?: string[]; credentials?: VerifiedPresentationCredential[];
}
export interface VerificationPresentationLedger {
  id: string; holderDid: string | null; presentationType: string; credentialCount: number;
  outcome: 'pending' | 'valid' | 'invalid'; occurredAt: string; credentials: VerifiedPresentationCredential[];
}
export interface VerificationLog { id: string; credentialId: string | null; valid: boolean; checkedAt: string; format: string; failedChecks: string[]; disclosedPaths: string[] }
export interface StructuredLog { id: string; occurredAt: string; level: string; module: string; action: string; success: boolean; message: string }
export interface SensitiveAccessLog { id: string; actorId: string; credentialId: string; purposeCode: string; correlationId: string | null; occurredAt: string }
export interface SessionInfo {
  accessToken: string; expiresAt: string; actor: { id: string; displayName?: string; email?: string; externalSubject?: string };
  tenant: WorkspaceSummary; roles: string[]; workspaces?: WorkspaceSummary[];
}

export interface WorkspaceSummary {
  id: string; name: string; type: 'personal' | 'organization'; slug: string; status: string;
  verificationStatus: 'not_applicable' | 'pending' | 'approved' | 'rejected' | 'suspended'; roles: string[];
}
