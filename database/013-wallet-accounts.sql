-- Holder wallet accounts are deliberately separate from organization console accounts.

CREATE TABLE IF NOT EXISTS v2_wallet_accounts (
  id CHAR(36) PRIMARY KEY,
  normalized_email VARCHAR(320) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_phc VARCHAR(512) NOT NULL,
  custody_mode ENUM('self_custody', 'managed_demo') NOT NULL DEFAULT 'self_custody',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  UNIQUE KEY uq_v2_wallet_accounts_email (normalized_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_wallet_sessions (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_wallet_sessions_account FOREIGN KEY (account_id) REFERENCES v2_wallet_accounts(id),
  UNIQUE KEY uq_v2_wallet_sessions_token (token_hash),
  KEY idx_v2_wallet_sessions_account_expiry (account_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (13);
