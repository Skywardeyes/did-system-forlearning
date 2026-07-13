-- V2 credential aggregate. This migration is additive and leaves V1 teaching tables untouched.

CREATE TABLE IF NOT EXISTS v2_credentials (
  id VARCHAR(128) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  issuer_did_id CHAR(36) NOT NULL,
  holder_did_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL,
  valid_from TIMESTAMP(3) NOT NULL,
  valid_until TIMESTAMP(3) NOT NULL,
  issued_at TIMESTAMP(3) NOT NULL,
  suspended_at TIMESTAMP(3) NULL,
  resumed_at TIMESTAMP(3) NULL,
  revoked_at TIMESTAMP(3) NULL,
  replaced_at TIMESTAMP(3) NULL,
  replaces_credential_id VARCHAR(128) NULL,
  replaced_by_credential_id VARCHAR(128) NULL,
  encrypted_payload JSON NOT NULL,
  row_version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_v2_credentials_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_credentials_issuer FOREIGN KEY (issuer_did_id) REFERENCES v2_dids(id),
  CONSTRAINT fk_v2_credentials_holder FOREIGN KEY (holder_did_id) REFERENCES v2_dids(id),
  KEY idx_v2_credentials_tenant_status_valid (tenant_id, status, valid_until),
  KEY idx_v2_credentials_issuer (tenant_id, issuer_did_id, issued_at),
  KEY idx_v2_credentials_holder (tenant_id, holder_did_id, issued_at),
  KEY idx_v2_credentials_replaces (tenant_id, replaces_credential_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_credential_status_events (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  credential_id VARCHAR(128) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_id CHAR(36) NULL,
  reason VARCHAR(1024) NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_credential_status_events_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_credential_status_events_credential FOREIGN KEY (credential_id) REFERENCES v2_credentials(id),
  KEY idx_v2_credential_status_events_credential_time (credential_id, occurred_at),
  KEY idx_v2_credential_status_events_tenant_time (tenant_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Disclosure material and verification evidence are intentionally separate from the signed VC.
-- They are populated when the selective-disclosure and verification services migrate in the next stage.
CREATE TABLE IF NOT EXISTS v2_credential_disclosure_materials (
  credential_id VARCHAR(128) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  encrypted_teaching_material JSON NULL,
  encrypted_sd_jwt_material JSON NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_disclosure_materials_credential FOREIGN KEY (credential_id) REFERENCES v2_credentials(id),
  CONSTRAINT fk_v2_disclosure_materials_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  KEY idx_v2_disclosure_materials_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_verification_logs (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  credential_id VARCHAR(128) NULL,
  verification_kind VARCHAR(64) NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  encrypted_evidence JSON NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_verification_logs_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  KEY idx_v2_verification_logs_tenant_time (tenant_id, occurred_at),
  KEY idx_v2_verification_logs_credential_time (credential_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (3);
