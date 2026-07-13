-- Append-only V2 audit log storage. Clear operations append a cutoff event instead of deleting rows.

CREATE TABLE IF NOT EXISTS v2_audit_logs (
  id CHAR(36) PRIMARY KEY,
  sequence_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id CHAR(36) NULL,
  actor_id CHAR(36) NULL,
  log_type VARCHAR(32) NOT NULL,
  level_code VARCHAR(32) NOT NULL,
  module_code VARCHAR(64) NOT NULL,
  action_code VARCHAR(128) NOT NULL,
  success BOOLEAN NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  encrypted_payload JSON NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  UNIQUE KEY uq_v2_audit_logs_sequence (sequence_id),
  KEY idx_v2_audit_logs_time (occurred_at, id),
  KEY idx_v2_audit_logs_tenant_time (tenant_id, occurred_at),
  KEY idx_v2_audit_logs_module_action (module_code, action_code, occurred_at),
  KEY idx_v2_audit_logs_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_audit_log_clear_events (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  actor_id CHAR(36) NULL,
  cutoff_sequence BIGINT UNSIGNED NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_audit_clear_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  KEY idx_v2_audit_clear_time (occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (4);
