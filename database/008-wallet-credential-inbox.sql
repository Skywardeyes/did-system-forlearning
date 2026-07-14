CREATE TABLE IF NOT EXISTS v2_wallet_credential_offers (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  credential_id VARCHAR(128) NOT NULL,
  holder_did VARCHAR(512) NOT NULL,
  status ENUM('pending','claimed','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  encrypted_delivery JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  decided_at TIMESTAMP(3) NULL,
  rejection_reason VARCHAR(255) NULL,
  CONSTRAINT fk_wallet_offer_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_wallet_offer_credential FOREIGN KEY (credential_id) REFERENCES v2_credentials(id),
  UNIQUE KEY uq_wallet_offer_credential (tenant_id, credential_id),
  KEY idx_wallet_offer_holder_status (holder_did, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_wallet_inbox_challenges (
  id CHAR(36) PRIMARY KEY,
  holder_did VARCHAR(512) NOT NULL,
  challenge_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  consumed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uq_wallet_inbox_challenge (holder_did, challenge_hash),
  KEY idx_wallet_inbox_challenge_expiry (holder_did, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (8);
