const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DB_NAME = 'did-vc-personal-wallet'
const DB_VERSION = 1
const IDENTITY_STORE = 'identities'
const PACKAGE_STORE = 'packages'

export const DISCLOSABLE_PATHS = Object.freeze([
  ['credentialSubject.name', '姓名'],
  ['credentialSubject.course', '课程'],
  ['credentialSubject.completionDate', '完成日期'],
])

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function base58Encode(bytes) {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) + BigInt(byte)
  let output = ''
  while (value > 0n) { const remainder = Number(value % 58n); value /= 58n; output = BASE58[remainder] + output }
  let zeroes = 0
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1
  return '1'.repeat(zeroes) + output
}

function toBase64Url(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fingerprint(publicJwk) {
  const raw = Uint8Array.from(atob(publicJwk.x.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(publicJwk.x.length / 4) * 4, '=')), (char) => char.charCodeAt(0))
  return `z${base58Encode(new Uint8Array([0xed, 0x01, ...raw]))}`
}

function didDocument(did, publicJwk) {
  const verificationMethod = `${did}#${did.slice('did:key:'.length)}`
  return {
    '@context': ['https://www.w3.org/ns/did/v1'], id: did,
    verificationMethod: [{ id: verificationMethod, type: 'JsonWebKey2020', controller: did, publicKeyJwk: publicJwk }],
    authentication: [verificationMethod], assertionMethod: [verificationMethod],
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PACKAGE_STORE)) db.createObjectStore(PACKAGE_STORE, { keyPath: 'credentialId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction(store, mode, action) {
  const db = await openDatabase()
  try { const result = await action(db.transaction(store, mode).objectStore(store)); return result } finally { db.close() }
}

export async function createIdentity(label = '我的身份') {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持 Web Crypto，无法在本地生成密钥')
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const did = `did:key:${fingerprint(publicJwk)}`
  const document = didDocument(did, publicJwk)
  const identity = { id: 'primary', label: String(label || '我的身份').slice(0, 120), did, document, publicJwk,
    privateKey: pair.privateKey, publicKey: pair.publicKey, createdAt: new Date().toISOString() }
  return identity
}

export async function createAndStoreIdentity(label = '我的身份') {
  const identity = await createIdentity(label)
  await transaction(IDENTITY_STORE, 'readwrite', (store) => requestToPromise(store.put(identity)))
  return identity
}

export async function loadIdentity() {
  return transaction(IDENTITY_STORE, 'readonly', (store) => requestToPromise(store.get('primary')))
}

export function registrationPackage(identity) {
  if (!identity?.did || !identity?.document) throw new Error('请先在本钱包创建身份')
  return { format: 'holder-did-registration-v1', name: identity.label, did: identity.did, document: identity.document }
}

function assertWalletPackage(value) {
  if (value?.format !== 'wallet-vc-package-v1' || !value?.credentialId || !value?.holderDid || !value?.credential?.proof?.proofValue
    || !value?.sdJwt?.issuerJwt || !value?.sdJwt?.disclosures || typeof value.sdJwt.disclosures !== 'object') {
    throw new Error('这不是可导入的钱包 VC 交付包')
  }
  return value
}

export async function importWalletPackage(raw, identity) {
  const value = assertWalletPackage(typeof raw === 'string' ? JSON.parse(raw) : raw)
  if (!identity?.did || value.holderDid !== identity.did || value.credential?.credentialSubject?.id !== identity.did) {
    throw new Error('该凭证的 Holder DID 与当前钱包身份不匹配')
  }
  const packageRecord = { ...value, importedAt: new Date().toISOString() }
  await transaction(PACKAGE_STORE, 'readwrite', (store) => requestToPromise(store.put(packageRecord)))
  return packageRecord
}

export async function listWalletPackages() {
  const items = await transaction(PACKAGE_STORE, 'readonly', (store) => requestToPromise(store.getAll()))
  return items.sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)))
}

export function randomChallenge() {
  const value = new Uint8Array(24); crypto.getRandomValues(value); return toBase64Url(value)
}

export async function createWalletPresentation({ identity, walletPackage, paths, challenge, domain }) {
  if (!identity?.privateKey || !identity?.did) throw new Error('本钱包没有可用的 Holder 私钥')
  const selected = [...new Set(Array.isArray(paths) ? paths : [])]
  if (!selected.length || selected.some((path) => !Object.prototype.hasOwnProperty.call(walletPackage?.sdJwt?.disclosures || {}, path))) {
    throw new Error('请选择至少一个可披露字段')
  }
  const nonce = String(challenge || '').trim()
  const audience = String(domain || '').trim()
  if (nonce.length < 16 || !audience) throw new Error('验证方 Challenge 至少 16 个字符，且必须填写验证方域名/标识')
  const sdJwt = `${walletPackage.sdJwt.issuerJwt}~${selected.map((path) => walletPackage.sdJwt.disclosures[path]).join('~')}~`
  const verificationMethod = identity.document.verificationMethod[0].id
  const binding = { type: 'WalletBoundSdJwtPresentation2026', sdJwt, holderDid: identity.did, verificationMethod, challenge: nonce, domain: audience }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, identity.privateKey, new TextEncoder().encode(stableStringify(binding)))
  return { ...binding, holderProof: { type: 'Ed25519Signature2020', created: new Date().toISOString(),
    verificationMethod, proofPurpose: 'authentication', challenge: nonce, domain: audience, proofValue: toBase64Url(new Uint8Array(signature)) } }
}

export async function createInboxProof({ identity, action, challenge }) {
  if (!identity?.privateKey || !identity?.did || !challenge) throw new Error('钱包身份或收件箱 Challenge 不可用')
  const verificationMethod = identity.document.verificationMethod[0].id
  const request = { type: 'WalletInboxRequest2026', holderDid: identity.did, action, challenge, domain: 'wallet-inbox' }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, identity.privateKey, new TextEncoder().encode(stableStringify(request)))
  return { verificationMethod, proofValue: toBase64Url(new Uint8Array(signature)) }
}
