-- A self-custody Holder DID is public identity material that may be presented to
-- more than one Issuer tenant. Keep a tenant-scoped registration/reference rather
-- than making a public DID globally owned by the first institution that sees it.

ALTER TABLE v2_dids
  DROP INDEX uq_v2_dids_did,
  ADD UNIQUE KEY uq_v2_dids_tenant_did (tenant_id, did);

INSERT IGNORE INTO schema_migrations(version) VALUES (6);
