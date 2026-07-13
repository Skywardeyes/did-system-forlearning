CREATE TABLE schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB;
INSERT INTO schema_migrations(version) VALUES (1);

CREATE TABLE kms_keys (
  key_id CHAR(36) PRIMARY KEY, did VARCHAR(512) NOT NULL, key_version INT NOT NULL,
  public_jwk JSON NOT NULL, ciphertext TEXT NOT NULL, iv VARCHAR(64) NOT NULL, auth_tag VARCHAR(64) NOT NULL,
  master_key_id VARCHAR(128) NOT NULL, encryption_version INT NOT NULL, status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL, retired_at TIMESTAMP(3) NULL,
  INDEX idx_kms_did_version (did(191), key_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dids (id VARCHAR(512) PRIMARY KEY, payload JSON NOT NULL, position_index INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE credentials (id VARCHAR(512) PRIMARY KEY, payload JSON NOT NULL, position_index INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE verification_logs (id VARCHAR(512) PRIMARY KEY, payload JSON NOT NULL, position_index INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE disclosure_verification_logs (id VARCHAR(512) PRIMARY KEY, payload JSON NOT NULL, position_index INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE audit_logs (id VARCHAR(512) PRIMARY KEY, payload JSON NOT NULL, position_index INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
