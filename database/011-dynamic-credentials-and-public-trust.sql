-- Dynamic credential templates, cross-tenant public trust projections, and multi-credential verification ledgers.
-- Public projections intentionally contain no credential claims, disclosure material, or private keys.

CREATE TABLE IF NOT EXISTS v2_credential_templates (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  credential_type VARCHAR(128) NOT NULL,
  version INT NOT NULL,
  status ENUM('draft', 'published', 'retired') NOT NULL DEFAULT 'draft',
  schema_json JSON NOT NULL,
  schema_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_actor_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  published_at TIMESTAMP(3) NULL,
  retired_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_credential_templates_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_credential_templates_actor FOREIGN KEY (created_by_actor_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_credential_templates_tenant_name_version (tenant_id, name, version),
  KEY idx_v2_credential_templates_tenant_status (tenant_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE v2_credentials
  ADD COLUMN template_id CHAR(36) NULL AFTER holder_did_id,
  ADD COLUMN template_version INT NULL AFTER template_id,
  ADD COLUMN schema_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER template_version,
  ADD CONSTRAINT fk_v2_credentials_template FOREIGN KEY (template_id) REFERENCES v2_credential_templates(id),
  ADD KEY idx_v2_credentials_template (tenant_id, template_id, template_version);

CREATE TABLE IF NOT EXISTS v2_public_did_registry (
  did VARCHAR(512) PRIMARY KEY,
  owner_tenant_id CHAR(36) NULL,
  method VARCHAR(64) NOT NULL,
  role_code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  did_version INT NOT NULL,
  key_version INT NOT NULL,
  public_document JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_public_did_owner FOREIGN KEY (owner_tenant_id) REFERENCES v2_organizations(id),
  KEY idx_v2_public_did_role_status (role_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_public_did_key_versions (
  did VARCHAR(512) NOT NULL,
  key_version INT NOT NULL,
  verification_method VARCHAR(768) NOT NULL,
  public_jwk JSON NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  retired_at TIMESTAMP(3) NULL,
  PRIMARY KEY (did, key_version),
  KEY idx_v2_public_keys_method (verification_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_public_credential_status (
  credential_id VARCHAR(128) PRIMARY KEY,
  issuer_did VARCHAR(512) NOT NULL,
  status VARCHAR(32) NOT NULL,
  valid_until TIMESTAMP(3) NOT NULL,
  replaced_by_credential_id VARCHAR(128) NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  KEY idx_v2_public_credential_issuer_status (issuer_did, status),
  KEY idx_v2_public_credential_expiry (valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_verification_presentations (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  holder_did VARCHAR(512) NULL,
  presentation_type VARCHAR(96) NOT NULL,
  credential_count INT NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  encrypted_evidence JSON NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_verification_presentations_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  KEY idx_v2_verification_presentations_tenant_time (tenant_id, occurred_at),
  KEY idx_v2_verification_presentations_holder_time (holder_did, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_verification_presentation_items (
  id CHAR(36) PRIMARY KEY,
  presentation_id CHAR(36) NOT NULL,
  credential_id VARCHAR(128) NULL,
  issuer_did VARCHAR(512) NULL,
  credential_type VARCHAR(128) NULL,
  outcome VARCHAR(32) NOT NULL,
  disclosed_paths JSON NOT NULL,
  failed_checks JSON NOT NULL,
  CONSTRAINT fk_v2_verification_items_presentation FOREIGN KEY (presentation_id) REFERENCES v2_verification_presentations(id),
  KEY idx_v2_verification_items_presentation (presentation_id),
  KEY idx_v2_verification_items_credential (credential_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE v2_verifier_challenges
  ADD COLUMN consumed_presentation_id CHAR(36) NULL AFTER consumed_credential_id,
  ADD CONSTRAINT fk_v2_verifier_challenge_presentation FOREIGN KEY (consumed_presentation_id) REFERENCES v2_verification_presentations(id);

INSERT INTO v2_public_did_registry
  (did, owner_tenant_id, method, role_code, status, did_version, key_version, public_document, updated_at)
SELECT did, IF(role_code = 'issuer', tenant_id, NULL), method, role_code, status, did_version, key_version, public_document, updated_at
FROM v2_dids
ON DUPLICATE KEY UPDATE
  owner_tenant_id = VALUES(owner_tenant_id), method = VALUES(method), role_code = VALUES(role_code), status = VALUES(status),
  did_version = VALUES(did_version), key_version = VALUES(key_version), public_document = VALUES(public_document), updated_at = VALUES(updated_at);

INSERT INTO v2_public_did_key_versions
  (did, key_version, verification_method, public_jwk, status, created_at, retired_at)
SELECT dids.did, key_versions.key_version, key_versions.verification_method, key_versions.public_jwk, key_versions.status, key_versions.created_at, key_versions.retired_at
FROM v2_did_key_versions AS key_versions
INNER JOIN v2_dids AS dids ON dids.id = key_versions.did_id
ON DUPLICATE KEY UPDATE verification_method = VALUES(verification_method), public_jwk = VALUES(public_jwk),
  status = VALUES(status), retired_at = VALUES(retired_at);

INSERT INTO v2_public_credential_status
  (credential_id, issuer_did, status, valid_until, replaced_by_credential_id, updated_at)
SELECT credentials.id, dids.did, credentials.status, credentials.valid_until, credentials.replaced_by_credential_id,
       COALESCE(credentials.revoked_at, credentials.replaced_at, credentials.resumed_at, credentials.suspended_at, credentials.issued_at)
FROM v2_credentials AS credentials
INNER JOIN v2_dids AS dids ON dids.id = credentials.issuer_did_id
ON DUPLICATE KEY UPDATE status = VALUES(status), valid_until = VALUES(valid_until),
  replaced_by_credential_id = VALUES(replaced_by_credential_id), updated_at = VALUES(updated_at);

INSERT IGNORE INTO schema_migrations(version) VALUES (11);
