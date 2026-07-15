import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { createEnvelopeCrypto } from './envelope-crypto.js';
import { MySqlLogStore, MySqlStore } from './mysql-store.js';
import { assertSupportedSchema } from './mysql-schema.js';
import { LocalKms } from './local-kms.js';
import { TransactionalLocalKms } from './kms/transactional-local-kms.js';
import { LogService } from './log-service.js';
import { VcService } from './vc-service.js';
import { createAppServer } from './server.js';
import { MySqlUnitOfWork } from './repositories/unit-of-work.js';
import { DidRepository } from './repositories/did-repository.js';
import { DidKeyVersionRepository } from './repositories/did-key-version-repository.js';
import { CredentialRepository } from './repositories/credential-repository.js';
import { CredentialStatusEventRepository } from './repositories/credential-status-event-repository.js';
import { CredentialDisclosureMaterialRepository } from './repositories/credential-disclosure-material-repository.js';
import { VerificationLogRepository } from './repositories/verification-log-repository.js';
import { SensitiveAccessLogRepository } from './repositories/sensitive-access-log-repository.js';
import { VerifierChallengeRepository } from './repositories/verifier-challenge-repository.js';
import { WalletCredentialOfferRepository } from './repositories/wallet-credential-offer-repository.js';
import { MembershipRepository, OrganizationRepository } from './repositories/organization-repository.js';
import { V2DidService } from './services/v2-did-service.js';
import { V2CredentialService } from './services/v2-credential-service.js';
import { V2DisclosureService } from './services/v2-disclosure-service.js';
import { V2AccessService } from './services/v2-access-service.js';
import { V2VerificationService } from './services/v2-verification-service.js';
import { LocalSessionService } from './services/local-session-service.js';
import { V2CredentialAccessService } from './services/v2-credential-access-service.js';
import { Hs256RequestAuthenticator } from './auth/request-authenticator.js';
import { SessionValidatingAuthenticator } from './auth/session-validating-authenticator.js';
import { JwtTokenService } from './auth/jwt-token-service.js';
import { IdentityAccessRepository } from './repositories/identity-access-repository.js';
import { IdentityAccessService } from './services/identity-access-service.js';
import { OrganizationGovernanceRepository } from './repositories/organization-governance-repository.js';
import { OrganizationGovernanceService } from './services/organization-governance-service.js';
import { HolderDidDirectoryRepository } from './repositories/holder-did-directory-repository.js';
import { HolderDidDirectoryService } from './services/holder-did-directory-service.js';
import { CredentialTemplateRepository } from './repositories/credential-template-repository.js';
import { CredentialTemplateService } from './services/credential-template-service.js';
import { PublicTrustRepository } from './repositories/public-trust-repository.js';
import { VerificationPresentationRepository } from './repositories/verification-presentation-repository.js';
import { V2Api } from './v2-api.js';
import { WalletInboxService } from './services/wallet-inbox-service.js';
import { ChainRegistryService } from './services/chain-registry-service.js';
import { NfcPresentationRepository } from './repositories/nfc-presentation-repository.js';
import { NfcPresentationService } from './services/nfc-presentation-service.js';
import { WalletAccountRepository } from './repositories/wallet-account-repository.js';
import { WalletAccountService } from './services/wallet-account-service.js';
import { HolderOrganizationRequestRepository } from './repositories/holder-organization-request-repository.js';
import { HolderOrganizationRequestService } from './services/holder-organization-request-service.js';
import { DualAuditLogStore, V2AuditLogStore } from './repositories/v2-audit-log-store.js';

export async function bootstrap(env = process.env, { createPool = mysql.createPool } = {}) {
  const config = loadRuntimeConfig(env);
  const pool = createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, connectionLimit: 5 });
  try {
    await pool.execute('SELECT 1');
    await assertSupportedSchema(pool, { requiredVersion: config.application.dataMode === 'v1' ? 1 : 14 });
    const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([[config.kms.activeKeyId, config.kms.masterKey]]), activeKeyId: config.kms.activeKeyId });
    const legacyEnabled = config.application.dataMode !== 'v2';
    const legacyStore = legacyEnabled ? new MySqlStore(pool, { envelopeCrypto }) : null;
    const legacyLogStore = new MySqlLogStore(pool);
    const v2LogStore = new V2AuditLogStore(pool, { envelopeCrypto });
    const selectedLogStore = config.application.dataMode === 'v1' ? legacyLogStore
      : config.application.dataMode === 'dual' ? new DualAuditLogStore(v2LogStore, legacyLogStore) : v2LogStore;
    const logService = new LogService(selectedLogStore);
    const service = legacyEnabled ? new VcService(legacyStore, undefined, { kms: new LocalKms(legacyStore, envelopeCrypto) }) : null;
    let v2Api = null;
    if (config.auth.enabled && config.application.dataMode !== 'v1') {
      const unitOfWork = new MySqlUnitOfWork(pool);
      const didRepository = new DidRepository({ envelopeCrypto });
      const didKeyVersionRepository = new DidKeyVersionRepository();
      const credentialRepository = new CredentialRepository({ envelopeCrypto });
      const credentialStatusEventRepository = new CredentialStatusEventRepository();
      const disclosureMaterialRepository = new CredentialDisclosureMaterialRepository({ envelopeCrypto });
      const verificationLogRepository = new VerificationLogRepository({ envelopeCrypto });
      const verifierChallengeRepository = new VerifierChallengeRepository();
      const walletOfferRepository = new WalletCredentialOfferRepository({ envelopeCrypto });
      const sensitiveAccessLogRepository = new SensitiveAccessLogRepository();
      const transactionalKms = new TransactionalLocalKms(envelopeCrypto);
      const publicTrustRepository = new PublicTrustRepository();
      const credentialTemplateRepository = new CredentialTemplateRepository();
      const presentationRepository = new VerificationPresentationRepository({ envelopeCrypto });
      const credentialTemplateService = new CredentialTemplateService({ unitOfWork, repository: credentialTemplateRepository });
      const didService = new V2DidService({ unitOfWork, didRepository, didKeyVersionRepository, publicTrustRepository, kms: transactionalKms });
      const credentialService = new V2CredentialService({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository,
        credentialStatusEventRepository, disclosureMaterialRepository, walletOfferRepository, credentialTemplateRepository,
        organizationRepository: new OrganizationRepository(), publicTrustRepository, kms: transactionalKms });
      const disclosureService = new V2DisclosureService({ unitOfWork, credentialRepository, disclosureMaterialRepository, verificationLogRepository });
      const verificationService = new V2VerificationService({ unitOfWork, didRepository, didKeyVersionRepository,
        credentialRepository, verificationLogRepository, verifierChallengeRepository, publicTrustRepository, presentationRepository });
      const credentialAccessService = new V2CredentialAccessService({ unitOfWork, credentialRepository, sensitiveAccessLogRepository });
      const accessService = new V2AccessService({ unitOfWork, membershipRepository: new MembershipRepository() });
      const signatureAuthenticator = new Hs256RequestAuthenticator({ secret: config.auth.jwtHs256Secret });
      const authenticator = new SessionValidatingAuthenticator({ authenticator: signatureAuthenticator, pool,
        allowSessionless: config.auth.localDevLogin });
      const identityAccessService = new IdentityAccessService({ pool, repository: new IdentityAccessRepository(),
        tokenService: new JwtTokenService({ secret: config.auth.jwtHs256Secret }) });
      const organizationGovernanceService = new OrganizationGovernanceService({ pool, repository: new OrganizationGovernanceRepository() });
      const holderDidDirectoryService = new HolderDidDirectoryService({ pool, repository: new HolderDidDirectoryRepository(), didService });
      const nfcPresentationService = new NfcPresentationService({ pool,
        repository: new NfcPresentationRepository({ envelopeCrypto }), holderDidDirectoryRepository: new HolderDidDirectoryRepository(), verificationService });
      const walletAccountService = new WalletAccountService({ pool, repository: new WalletAccountRepository() });
      const holderOrganizationRequestService = new HolderOrganizationRequestService({ pool,
        repository: new HolderOrganizationRequestRepository(), holderDidDirectoryService });
      const localSessionService = new LocalSessionService({
        pool, secret: config.auth.jwtHs256Secret, enabled: config.auth.localDevLogin,
        organizationName: env.BOOTSTRAP_ORG_NAME || '本地演示组织',
        externalSubject: env.BOOTSTRAP_ADMIN_SUBJECT || 'local-admin',
      });
      const walletInboxService = new WalletInboxService({ pool, walletOfferRepository });
      const chainRegistryService = new ChainRegistryService({ blockchain: config.blockchain });
      v2Api = new V2Api({ authenticator, accessService, didService, credentialService, disclosureService,
        verificationService, credentialAccessService, identityAccessService, organizationGovernanceService,
        holderDidDirectoryService, credentialTemplateService, localSessionService, logService, walletInboxService, chainRegistryService,
        nfcPresentationService, walletAccountService, holderOrganizationRequestService });
    }
    return { server: createAppServer(service, { logService, v2Api, legacyApiEnabled: legacyEnabled,
      requireHttps: config.security.requireHttps, serveFrontend: config.application.serveFrontend }), pool,
      dataMode: config.application.dataMode };
  } catch {
    await pool.end?.().catch(() => {});
    const error = new Error('Unable to initialize the configured MySQL database');
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  }
}
