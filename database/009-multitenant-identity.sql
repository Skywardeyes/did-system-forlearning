-- Unified natural-person accounts, personal workspaces, organization onboarding, invitations and revocable sessions.
-- Existing organizations remain approved organization workspaces for backward-compatible local demonstrations.

ALTER TABLE v2_users
  ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT '' AFTER external_subject,
  ADD COLUMN email VARCHAR(320) NULL AFTER display_name,
  ADD COLUMN email_verified_at TIMESTAMP(3) NULL AFTER email,
  ADD UNIQUE KEY uq_v2_users_email (email);

ALTER TABLE v2_organizations
  ADD COLUMN workspace_type ENUM('personal', 'organization') NOT NULL DEFAULT 'organization' AFTER name,
  ADD COLUMN slug VARCHAR(120) NULL AFTER workspace_type,
  ADD COLUMN verification_status ENUM('not_applicable', 'pending', 'approved', 'rejected', 'suspended')
    NOT NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN created_by_user_id CHAR(36) NULL AFTER verification_status,
  ADD COLUMN personal_owner_user_id CHAR(36) NULL AFTER created_by_user_id,
  ADD CONSTRAINT fk_v2_organizations_created_by FOREIGN KEY (created_by_user_id) REFERENCES v2_users(id),
  ADD CONSTRAINT fk_v2_organizations_personal_owner FOREIGN KEY (personal_owner_user_id) REFERENCES v2_users(id),
  ADD UNIQUE KEY uq_v2_organizations_personal_owner (personal_owner_user_id);

UPDATE v2_organizations
SET slug = CONCAT('legacy-', LEFT(REPLACE(id, '-', ''), 24)),
    verification_status = 'approved'
WHERE slug IS NULL;

ALTER TABLE v2_organizations
  MODIFY COLUMN slug VARCHAR(120) NOT NULL,
  ADD UNIQUE KEY uq_v2_organizations_slug (slug),
  DROP INDEX uq_v2_organizations_name;

CREATE TABLE IF NOT EXISTS v2_local_accounts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  normalized_email VARCHAR(320) NOT NULL,
  password_phc VARCHAR(512) NOT NULL,
  credential_version INT NOT NULL DEFAULT 1,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP(3) NULL,
  last_login_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_local_accounts_user FOREIGN KEY (user_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_local_accounts_user (user_id),
  UNIQUE KEY uq_v2_local_accounts_email (normalized_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_organization_applications (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  submitted_by_user_id CHAR(36) NOT NULL,
  organization_type VARCHAR(64) NOT NULL,
  registration_number VARCHAR(128) NULL,
  evidence_json JSON NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  review_note VARCHAR(500) NULL,
  reviewed_by_user_id CHAR(36) NULL,
  submitted_at TIMESTAMP(3) NOT NULL,
  reviewed_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_org_app_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_org_app_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES v2_users(id),
  CONSTRAINT fk_v2_org_app_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES v2_users(id),
  KEY idx_v2_org_app_status_time (status, submitted_at),
  KEY idx_v2_org_app_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_workspace_invitations (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  invited_email VARCHAR(320) NOT NULL,
  role_code VARCHAR(64) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending', 'accepted', 'revoked', 'expired') NOT NULL DEFAULT 'pending',
  invited_by_user_id CHAR(36) NOT NULL,
  accepted_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  accepted_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_invitation_tenant FOREIGN KEY (tenant_id) REFERENCES v2_organizations(id),
  CONSTRAINT fk_v2_invitation_inviter FOREIGN KEY (invited_by_user_id) REFERENCES v2_users(id),
  CONSTRAINT fk_v2_invitation_acceptor FOREIGN KEY (accepted_by_user_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_invitation_token_hash (token_hash),
  KEY idx_v2_invitation_email_status (invited_email, status),
  KEY idx_v2_invitation_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_platform_roles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role_code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT fk_v2_platform_roles_user FOREIGN KEY (user_id) REFERENCES v2_users(id),
  UNIQUE KEY uq_v2_platform_roles_user_role (user_id, role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS v2_auth_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  credential_version INT NOT NULL,
  status ENUM('active', 'revoked', 'expired') NOT NULL DEFAULT 'active',
  authentication_method VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL,
  last_seen_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_v2_auth_sessions_user FOREIGN KEY (user_id) REFERENCES v2_users(id),
  KEY idx_v2_auth_sessions_user_status (user_id, status),
  KEY idx_v2_auth_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations(version) VALUES (9);
