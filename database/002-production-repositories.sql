-- V2 production repository foundation.
-- This migration is additive: V1 tables remain available until all services are migrated.

CREATE TABLE IF NOT EXISTS v2_organizations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  row_version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_v2_organizations_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_users (
  id CHAR(36) PRIMARY KEY,
  external_subject VARCHAR(512) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uq_v2_users_external_subject (external_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_memberships (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  row_version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_v2_memberships_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_memberships_user FOREIGN KEY (user_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_memberships_tenant_user_role (tenant_id, user_id, role_code),
  KEY idx_v2_memberships_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_dids (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  did VARCHAR(512) NOT NULL,
  method VARCHAR(64) NOT NULL,
  role_code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  did_version INT NOT NULL,
  key_version INT NOT NULL,
  public_document JSON NOT NULL,
  encrypted_metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  row_version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_v2_dids_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  UNIQUE KEY uq_v2_dids_did (did),
  KEY idx_v2_dids_tenant_role_status (tenant_id, role_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_did_key_versions (
  id CHAR(36) PRIMARY KEY,
  did_id CHAR(36) NOT NULL,
  key_version INT NOT NULL,
  kms_key_id CHAR(36) NOT NULL,
  verification_method VARCHAR(768) NOT NULL,
  public_jwk JSON NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  retired_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_did_key_versions_did FOREIGN KEY (did_id) REFERENCES v2_dids(id),
  UNIQUE KEY uq_v2_did_key_versions_did_version (did_id, key_version),
  UNIQUE KEY uq_v2_did_key_versions_kms_key (kms_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (2);
