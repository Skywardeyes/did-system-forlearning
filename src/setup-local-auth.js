import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function ensureAuthSecret(envText, generatedSecret) {
  let text = envText; let changed = false;
  if (!/^AUTH_JWT_HS256_SECRET=.+$/m.test(text)) {
    const separator = text.endsWith('\n') || text.endsWith('\r') ? '' : '\n';
    text = `${text}${separator}AUTH_JWT_HS256_SECRET=${generatedSecret}\n`; changed = true;
  }
  if (!/^AUTH_LOCAL_DEV_LOGIN=.+$/m.test(text)) { text = `${text}AUTH_LOCAL_DEV_LOGIN=true\n`; changed = true; }
  if (!/^BOOTSTRAP_GRANT_CREDENTIAL_READER=.+$/m.test(text)) { text = `${text}BOOTSTRAP_GRANT_CREDENTIAL_READER=true\n`; changed = true; }
  if (!/^BOOTSTRAP_GRANT_DEMO_ROLES=.+$/m.test(text)) { text = `${text}BOOTSTRAP_GRANT_DEMO_ROLES=true\n`; changed = true; }
  return { changed, text };
}

export async function setupLocalAuth(envPath = path.join(root, '.env')) {
  const current = await readFile(envPath, 'utf8');
  const generatedSecret = randomBytes(32).toString('base64');
  const result = ensureAuthSecret(current, generatedSecret);
  if (result.changed) await writeFile(envPath, result.text, { encoding: 'utf8', mode: 0o600 });
  return { configured: true, changed: result.changed };
}

async function main() {
  const result = await setupLocalAuth();
  process.stdout.write(result.changed ? 'Local JWT authentication configured.\n' : 'Local JWT authentication was already configured.\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Authentication setup failed: ${error.code || 'CONFIG_ERROR'}\n`);
    process.exitCode = 1;
  });
}
