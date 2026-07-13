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
  return {
    database: {
      host, port, database, user, password, ssl: env.DB_SSL === 'true',
    },
    kms: { masterKey, activeKeyId: env.KMS_MASTER_KEY_ID || 'local-master-v1' },
  };
}
