-- MVP role boundaries and simulated NFC presentation transfer.
-- Holder identities are published by a self-custody wallet and therefore are not tied to a platform user account.

ALTER TABLE v2_user_holder_dids
  DROP FOREIGN KEY fk_v2_user_holder_dids_user,
  MODIFY COLUMN user_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS v2_nfc_presentation_transfers (
  id CHAR(36) PRIMARY KEY,
  holder_did VARCHAR(512) NOT NULL,
  challenge_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('issued', 'pending', 'verified', 'invalid', 'expired') NOT NULL DEFAULT 'issued',
  encrypted_payload JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  submitted_at TIMESTAMP(3) NULL,
  verified_at TIMESTAMP(3) NULL,
  verified_by_tenant_id CHAR(36) NULL,
  verification_presentation_id CHAR(36) NULL,
  CONSTRAINT fk_v2_nfc_transfer_verifier FOREIGN KEY (verified_by_tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_nfc_transfer_presentation FOREIGN KEY (verification_presentation_id) REFERENCES v2_verification_presentations(id),
  KEY idx_v2_nfc_transfer_status_time (status, submitted_at),
  KEY idx_v2_nfc_transfer_holder_time (holder_did, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (12);
