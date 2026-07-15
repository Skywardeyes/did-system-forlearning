CREATE TABLE IF NOT EXISTS v2_holder_organization_requests (
  id CHAR(36) PRIMARY KEY,
  wallet_account_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NOT NULL,
  holder_did VARCHAR(512) NOT NULL,
  holder_display_name VARCHAR(120) NOT NULL,
  request_message VARCHAR(500) NULL,
  status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP(3) NOT NULL,
  decided_at TIMESTAMP(3) NULL,
  decided_by_actor_id CHAR(36) NULL,
  CONSTRAINT fk_v2_holder_request_wallet FOREIGN KEY (wallet_account_id) REFERENCES v2_wallet_accounts(id),
  CONSTRAINT fk_v2_holder_request_org FOREIGN KEY (organization_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_holder_request_actor FOREIGN KEY (decided_by_actor_id) REFERENCES v2_users(id),
  KEY idx_v2_holder_request_org_status_time (organization_id, status, created_at),
  KEY idx_v2_holder_request_wallet_time (wallet_account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (14);
