-- Sensitive credential content is never returned by list APIs. Every explicit plaintext access is append-only audited.

CREATE TABLE IF NOT EXISTS v2_sensitive_access_logs (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  credential_id VARCHAR(128) NOT NULL,
  purpose_code VARCHAR(64) NOT NULL,
  correlation_id CHAR(36) NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_sensitive_access_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_sensitive_access_actor FOREIGN KEY (actor_id) REFERENCES v2_users(id),
  CONSTRAINT fk_v2_sensitive_access_credential FOREIGN KEY (credential_id) REFERENCES v2_credentials(id),
  KEY idx_v2_sensitive_access_tenant_time (tenant_id, occurred_at),
  KEY idx_v2_sensitive_access_credential_time (credential_id, occurred_at),
  KEY idx_v2_sensitive_access_actor_time (actor_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (5);
