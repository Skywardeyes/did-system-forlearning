-- Holder-controlled DID directory. Only public DID Documents are stored; wallet private keys never enter this table.

CREATE TABLE IF NOT EXISTS v2_user_holder_dids (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  did VARCHAR(512) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  public_document JSON NOT NULL,
  status ENUM('active', 'deactivated') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_user_holder_dids_user FOREIGN KEY (user_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_user_holder_dids_did (did),
  KEY idx_v2_user_holder_dids_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (10);
