export class ConfigurationError extends Error {
  constructor(message) { super(message); this.name = 'ConfigurationError'; this.code = 'CONFIG_INVALID'; }
}

const required = (env, name) => {
  const value = String(env[name] || '').trim();
  if (!value) throw new ConfigurationError(`Missing required configuration: ${name}`);
  return value;
};

export function loadRuntimeConfig(env = process.env) {
  const host = required(env, 'DB_HOST');
  const database = required(env, 'DB_NAME');
  const user = required(env, 'DB_USER');
  const password = required(env, 'DB_PASSWORD');
  const portText = env.DB_PORT || '3306';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError('DB_PORT must be an integer from 1 to 65535');
  const encodedKey = required(env, 'KMS_MASTER_KEY');
  const masterKey = Buffer.from(encodedKey, 'base64');
  if (masterKey.length !== 32 || masterKey.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')) {
    throw new ConfigurationError('KMS_MASTER_KEY must be valid Base64 encoding exactly 32 bytes');
  }
  const authSecretText = String(env.AUTH_JWT_HS256_SECRET || '').trim();
  const authSecret = authSecretText ? Buffer.from(authSecretText, 'base64') : null;
  if (authSecretText && (authSecret.length < 32 || authSecret.toString('base64').replace(/=+$/, '') !== authSecretText.replace(/=+$/, ''))) {
    throw new ConfigurationError('AUTH_JWT_HS256_SECRET must be valid Base64 encoding at least 32 bytes');
  }
  const dataMode = String(env.APP_DATA_MODE || 'dual').trim().toLowerCase();
  if (!['v1', 'dual', 'v2'].includes(dataMode)) throw new ConfigurationError('APP_DATA_MODE must be v1, dual or v2');
  if (dataMode === 'v2' && !authSecret) throw new ConfigurationError('APP_DATA_MODE=v2 requires AUTH_JWT_HS256_SECRET');
  const localDevLogin = String(env.AUTH_LOCAL_DEV_LOGIN || 'false').trim().toLowerCase() === 'true';
  if (localDevLogin && !authSecret) throw new ConfigurationError('AUTH_LOCAL_DEV_LOGIN=true requires AUTH_JWT_HS256_SECRET');
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const requireHttps = String(env.REQUIRE_HTTPS || 'false').trim().toLowerCase() === 'true';
  if (production && localDevLogin) throw new ConfigurationError('Production mode forbids AUTH_LOCAL_DEV_LOGIN');
  if (production && dataMode !== 'v2') throw new ConfigurationError('Production mode requires APP_DATA_MODE=v2');
  if (production && !requireHttps) throw new ConfigurationError('Production mode requires REQUIRE_HTTPS=true');
  if (production && env.DB_SSL !== 'true') throw new ConfigurationError('Production mode requires DB_SSL=true');
  return {
    database: {
      host, port, database, user, password, ssl: env.DB_SSL === 'true',
    },
    kms: { masterKey, activeKeyId: env.KMS_MASTER_KEY_ID || 'local-master-v1' },
    auth: { enabled: Boolean(authSecret), jwtHs256Secret: authSecret, localDevLogin },
    application: { dataMode },
    security: { requireHttps, production },
  };
}
