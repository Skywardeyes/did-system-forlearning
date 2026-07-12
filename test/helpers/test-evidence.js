import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED = new Set(['evidence-manifest.json', 'checksums.sha256']);

async function walk(root, current = root) {
  const found = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) found.push(...await walk(root, full));
    else {
      const relative = path.relative(root, full).replaceAll('\\', '/');
      if (!EXCLUDED.has(relative)) found.push(relative);
    }
  }
  return found.sort();
}

async function digest(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }

export async function archiveDirectory(source, destination) {
  try { await cp(source, destination, { recursive: true, force: true }); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function buildEvidenceManifest(root) {
  const names = await walk(root);
  const files = [];
  for (const relativePath of names) {
    const full = path.join(root, relativePath); const info = await stat(full);
    files.push({ path: relativePath, bytes: info.size, sha256: await digest(full) });
  }
  return { algorithm: 'sha256', generatedAt: new Date().toISOString(), files };
}

export async function verifyEvidenceManifest(root, manifest) {
  const current = await walk(root); const expected = new Map(manifest.files.map((file) => [file.path, file]));
  const missing = [...expected.keys()].filter((name) => !current.includes(name));
  const extra = current.filter((name) => !expected.has(name)); const modified = [];
  for (const name of current.filter((item) => expected.has(item))) if (await digest(path.join(root, name)) !== expected.get(name).sha256) modified.push(name);
  return { valid: !missing.length && !extra.length && !modified.length, missing, extra, modified };
}
