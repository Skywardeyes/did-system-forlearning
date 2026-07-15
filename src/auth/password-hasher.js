import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const parameters = Object.freeze({ cost: 16384, blockSize: 8, parallelization: 1, keyLength: 32 });

export class PasswordValidationError extends Error {
  constructor(message) { super(message); this.name = 'PasswordValidationError'; this.code = 'PASSWORD_INVALID'; }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, parameters.keyLength, {
    N: parameters.cost, r: parameters.blockSize, p: parameters.parallelization,
  });
  return `scrypt$${parameters.cost}$${parameters.blockSize}$${parameters.parallelization}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText, ...extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || extra.length || !saltText || !hashText) return false;
  const cost = Number(costText); const blockSize = Number(blockSizeText); const parallelization = Number(parallelizationText);
  if (cost !== parameters.cost || blockSize !== parameters.blockSize || parallelization !== parameters.parallelization) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N: cost, r: blockSize, p: parallelization });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new PasswordValidationError('密码长度必须为 10 到 128 个字符');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new PasswordValidationError('密码必须同时包含字母和数字');
  }
}
