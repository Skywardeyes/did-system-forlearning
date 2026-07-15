const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DB_NAME = 'did-vc-personal-wallet'
const DB_VERSION = 2
const IDENTITY_STORE = 'account-identities'
const PACKAGE_STORE = 'account-packages'
let accountScope = null

export function setWalletAccountScope(accountId) {
  const value = String(accountId || '').trim()
  if (!value) throw new Error('钱包账号范围不可为空')
  accountScope = value
}

function scopedKey(suffix) {
  if (!accountScope) throw new Error('请先登录钱包账号')
  return `${accountScope}:${suffix}`
}

export const DISCLOSABLE_PATHS = Object.freeze([
  ['credentialSubject.name', '姓名'],
  ['credentialSubject.course', '课程'],
  ['credentialSubject.completionDate', '完成日期'],
])

const CREDENTIAL_TYPE_NAMES = Object.freeze({
  TrainingCompletionCredential: '培训结业凭证',
  UniversityDegreeCredential: '大学毕业证明',
  UiDegreeCredential: '大学毕业证明',
  SkillCredential: '职业资格证明',
  UiSkillCredential: '职业资格证明',
})

export function walletPackageFields(item) {
  return item?.display?.fields?.length ? item.display.fields
    : DISCLOSABLE_PATHS.filter(([path]) => item?.sdJwt?.disclosures?.[path])
      .map(([path, label], index) => ({ key: path.split('.').at(-1), path, label, order: index + 1 }))
}

export function walletCredentialDisplay(item) {
  const rawType = item?.credential?.type?.at(-1) || ''
  const credentialName = item?.display?.credentialName || CREDENTIAL_TYPE_NAMES[rawType] || '可验证凭证'
  const issuerName = item?.display?.issuerName || item?.credential?.issuerName || ''
  const title = issuerName && issuerName !== credentialName ? `${issuerName}·${credentialName}` : credentialName
  const subject = item?.credential?.credentialSubject || {}
  const details = walletPackageFields(item).map((field) => {
    const key = field.key || String(field.path || '').split('.').at(-1)
    const value = subject[key]
    if (value === undefined || value === null || value === '') return null
    const readable = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `${field.label || key}：${readable.slice(0, 32)}`
  }).filter(Boolean)
  const summary = details.slice(0, 3).join('，')
  const searchText = [title, summary, issuerName, rawType, item?.issuerDid, item?.credentialId, ...details].filter(Boolean).join(' ').toLocaleLowerCase()
  return { title, summary, optionLabel: summary ? `${title}｜${summary}` : title, searchText }
}

export function walletPackagesForIdentity(items, identity) {
  if (!identity?.did || !Array.isArray(items)) return []
  return items.filter((item) => item?.holderDid === identity.did)
}

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
      if (!db.objectStoreNames.contains(PACKAGE_STORE)) db.createObjectStore(PACKAGE_STORE, { keyPath: 'storageKey' })
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
  const localId = `identity:${crypto.randomUUID()}`
  const identity = { id: accountScope ? scopedKey(localId) : localId, label: String(label || '我的身份').slice(0, 120), did, document, publicJwk,
    privateKey: pair.privateKey, publicKey: pair.publicKey, createdAt: new Date().toISOString() }
  return identity
}

export async function createAndStoreIdentity(label = '我的身份') {
  const identity = await createIdentity(label)
  await transaction(IDENTITY_STORE, 'readwrite', (store) => requestToPromise(store.put(identity)))
  return identity
}

export async function loadIdentity() {
  const identities = await listIdentities()
  return identities[0] || null
}

export async function listIdentities() {
  const prefix = `${accountScope}:`
  const identities = await transaction(IDENTITY_STORE, 'readonly', (store) => requestToPromise(store.getAll()))
  return identities.filter((identity) => String(identity?.id || '').startsWith(prefix))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
}

export function registrationPackage(identity) {
  if (!identity?.did || !identity?.document) throw new Error('请先在本钱包创建身份')
  return { format: 'holder-did-registration-v1', name: identity.label, did: identity.did, document: identity.document }
}

export async function signedRegistrationPackage(identity) {
  if (!identity?.privateKey || !identity?.did || !identity?.document) throw new Error('请先在本钱包创建身份')
  const verificationMethod = identity.document.verificationMethod?.[0]?.id
  const binding = { type: 'HolderDidRegistration2026', name: identity.label, did: identity.did,
    document: identity.document, verificationMethod }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, identity.privateKey,
    new TextEncoder().encode(stableStringify(binding)))
  return { format: 'holder-did-registration-v2', ...binding,
    proof: { type: 'Ed25519Signature2020', verificationMethod, proofValue: toBase64Url(new Uint8Array(signature)) } }
}

export function assertWalletPackage(value) {
  const supportedFormat = value?.format === 'wallet-vc-package-v1' || value?.format === 'wallet-vc-package-v2'
  if (!supportedFormat || !value?.credentialId || !value?.holderDid || !value?.credential?.proof?.proofValue
    || !value?.sdJwt?.issuerJwt || !value?.sdJwt?.disclosures || typeof value.sdJwt.disclosures !== 'object') {
    throw new Error('这不是可导入的钱包 VC 交付包')
  }
  const disclosurePaths = Object.keys(value.sdJwt.disclosures)
  if (!disclosurePaths.length || disclosurePaths.length > 50 || disclosurePaths.some((path) => !/^credentialSubject\.[a-z][A-Za-z0-9_]{0,63}$/.test(path))) {
    throw new Error('Wallet VC package contains invalid disclosure paths')
  }
  if (value.format === 'wallet-vc-package-v2') {
    const fields = value?.display?.fields
    if (!Array.isArray(fields) || fields.length !== disclosurePaths.length
      || fields.some((field) => !disclosurePaths.includes(field?.path) || typeof field?.label !== 'string')) {
      throw new Error('Dynamic wallet VC package is missing trusted field metadata')
    }
  }
  return value
}

export async function importWalletPackage(raw, identity) {
  const value = assertWalletPackage(typeof raw === 'string' ? JSON.parse(raw) : raw)
  if (!identity?.did || value.holderDid !== identity.did || value.credential?.credentialSubject?.id !== identity.did) {
    throw new Error('该凭证的 Holder DID 与当前钱包身份不匹配')
  }
  const packageRecord = { ...value, storageKey: scopedKey(value.credentialId), accountId: accountScope, importedAt: new Date().toISOString() }
  await transaction(PACKAGE_STORE, 'readwrite', (store) => requestToPromise(store.put(packageRecord)))
  return packageRecord
}

export async function listWalletPackages() {
  const items = await transaction(PACKAGE_STORE, 'readonly', (store) => requestToPromise(store.getAll()))
  return items.filter((item) => item.accountId === accountScope)
    .sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)))
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

export async function createMultiWalletPresentation({ identity, selections, challenge, domain }) {
  if (!identity?.privateKey || !identity?.did) throw new Error('本钱包没有可用的 Holder 私钥')
  const nonce = String(challenge || '').trim(); const audience = String(domain || '').trim().toLowerCase()
  if (nonce.length < 16 || !audience) throw new Error('验证方 Challenge 至少 16 个字符，且必须填写验证方域名/标识')
  if (!Array.isArray(selections) || !selections.length || selections.length > 10) throw new Error('请选择 1 至 10 张本地凭证')
  const ids = new Set(); let disclosureCount = 0
  const verifiableCredentials = selections.map(({ walletPackage, paths }) => {
    if (!walletPackage?.credentialId || ids.has(walletPackage.credentialId) || walletPackage.holderDid !== identity.did) throw new Error('凭证重复或不属于当前 Holder DID')
    ids.add(walletPackage.credentialId)
    const selected = [...new Set(Array.isArray(paths) ? paths : [])]
    if (!selected.length || selected.some((path) => !Object.prototype.hasOwnProperty.call(walletPackage?.sdJwt?.disclosures || {}, path))) throw new Error('每张凭证至少选择一个可披露字段')
    disclosureCount += selected.length
    if (disclosureCount > 50) throw new Error('一次最多披露 50 个字段')
    return { format: 'vc+sd-jwt', sdJwt: `${walletPackage.sdJwt.issuerJwt}~${selected.map((path) => walletPackage.sdJwt.disclosures[path]).join('~')}~` }
  })
  const verificationMethod = identity.document.verificationMethod[0].id
  const binding = { type: 'WalletBoundMultiSdJwtPresentation2026', holderDid: identity.did,
    verifiableCredentials, challenge: nonce, domain: audience, createdAt: new Date().toISOString(), verificationMethod }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, identity.privateKey, new TextEncoder().encode(stableStringify(binding)))
  return { ...binding, holderProof: { type: 'Ed25519Signature2020', verificationMethod, proofPurpose: 'authentication',
    challenge: nonce, domain: audience, proofValue: toBase64Url(new Uint8Array(signature)) } }
}

export async function createInboxProof({ identity, action, challenge }) {
  if (!identity?.privateKey || !identity?.did || !challenge) throw new Error('钱包身份或收件箱 Challenge 不可用')
  const verificationMethod = identity.document.verificationMethod[0].id
  const request = { type: 'WalletInboxRequest2026', holderDid: identity.did, action, challenge, domain: 'wallet-inbox' }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, identity.privateKey, new TextEncoder().encode(stableStringify(request)))
  return { verificationMethod, proofValue: toBase64Url(new Uint8Array(signature)) }
}
