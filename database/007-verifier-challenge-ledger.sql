-- A wallet presentation must be bound to a verifier-issued, one-time challenge.
-- Store only a SHA-256 hash of the challenge; the plaintext is returned once
-- when the verifier creates it and is never recoverable from this ledger.

CREATE TABLE IF NOT EXISTS v2_verifier_challenges (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  challenge_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  domain VARCHAR(255) NOT NULL,
  created_by_actor_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  consumed_at TIMESTAMP(3) NULL,
  consumed_credential_id VARCHAR(128) NULL,
  CONSTRAINT fk_v2_verifier_challenge_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_verifier_challenge_actor FOREIGN KEY (created_by_actor_id) REFERENCES v2_users(id),
  CONSTRAINT fk_v2_verifier_challenge_credential FOREIGN KEY (consumed_credential_id) REFERENCES v2_credentials(id),
  UNIQUE KEY uq_v2_verifier_challenge_hash (tenant_id, challenge_hash),
  KEY idx_v2_verifier_challenge_expiry (tenant_id, expires_at),
  KEY idx_v2_verifier_challenge_consumed (tenant_id, consumed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (7);
