-- Bind every simulated NFC / QR presentation transfer to one approved verifier organization.

ALTER TABLE v2_nfc_presentation_transfers
  ADD COLUMN target_organization_id CHAR(36) NULL AFTER holder_did,
  ADD CONSTRAINT fk_v2_nfc_transfer_target_org
    FOREIGN KEY (target_organization_id) REFERENCES v2_organizations(id),
  ADD KEY idx_v2_nfc_transfer_target_status_time (target_organization_id, status, submitted_at);

INSERT IGNORE INTO schema_migrations(version) VALUES (15);
