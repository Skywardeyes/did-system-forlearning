import { createHash } from 'node:crypto';
import { stableStringify } from './crypto.js';

const KEY_PATTERN = /^[a-z][A-Za-z0-9_]{0,63}$/;
const TYPE_PATTERN = /^[A-Z][A-Za-z0-9]{2,127}$/;
const FIELD_TYPES = new Set(['string', 'number', 'boolean', 'date', 'datetime', 'enum']);
const RESERVED_KEYS = new Set(['id', 'issuer', 'proof', 'type', 'constructor', 'prototype', '__proto__']);

export function normalizeTemplateSchema(input = {}) {
  const name = requiredText(input.name, 'Template name', 160);
  const credentialType = String(input.credentialType || '').trim();
  if (!TYPE_PATTERN.test(credentialType) || credentialType === 'VerifiableCredential') throw new Error('Credential type must be a safe PascalCase identifier');
  const rawFields = Array.isArray(input.fields) ? input.fields : [];
  if (!rawFields.length || rawFields.length > 50) throw new Error('A credential template must define between 1 and 50 fields');
  const keys = new Set();
  const fields = rawFields.map((field, index) => {
    const key = String(field?.key || '').trim(); const label = requiredText(field?.label, `Field ${index + 1} label`, 120);
    const type = String(field?.type || 'string');
    if (!KEY_PATTERN.test(key) || RESERVED_KEYS.has(key) || keys.has(key)) throw new Error(`Credential field key is invalid or duplicated: ${key}`);
    if (!FIELD_TYPES.has(type)) throw new Error(`Credential field type is unsupported: ${type}`);
    keys.add(key);
    const options = type === 'enum' ? [...new Set((Array.isArray(field.options) ? field.options : []).map((item) => String(item).trim()).filter(Boolean))] : [];
    if (type === 'enum' && (!options.length || options.length > 50)) throw new Error(`Enum field ${key} must define between 1 and 50 options`);
    return { key, label, type, required: field?.required !== false, order: index + 1, ...(options.length ? { options } : {}) };
  });
  const schema = { name, credentialType, fields };
  return { ...schema, schemaHash: createHash('sha256').update(stableStringify(schema)).digest('hex') };
}

export function normalizeClaims(schema, inputClaims = {}) {
  if (!inputClaims || typeof inputClaims !== 'object' || Array.isArray(inputClaims)) throw new Error('Credential claims must be an object');
  const allowed = new Set(schema.fields.map((field) => field.key));
  const supplied = Object.keys(inputClaims);
  if (supplied.some((key) => !allowed.has(key))) throw new Error('Credential claims contain a field not declared by the template');
  const claims = {};
  for (const field of schema.fields) {
    const value = inputClaims[field.key];
    if ((value === undefined || value === null || value === '') && field.required) throw new Error(`Credential field is required: ${field.label}`);
    if (value === undefined || value === null || value === '') continue;
    claims[field.key] = normalizeValue(field, value);
  }
  return claims;
}

export function safeDisclosurePath(key) {
  if (!KEY_PATTERN.test(String(key)) || RESERVED_KEYS.has(String(key))) throw new Error('Disclosure field key is invalid');
  return `credentialSubject.${key}`;
}

function normalizeValue(field, value) {
  if (field.type === 'string') return requiredText(value, field.label, 2048);
  if (field.type === 'number') { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${field.label} must be a number`); return number; }
  if (field.type === 'boolean') { if (value !== true && value !== false) throw new Error(`${field.label} must be true or false`); return value; }
  if (field.type === 'enum') { const text = String(value); if (!field.options.includes(text)) throw new Error(`${field.label} is not an allowed option`); return text; }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new Error(`${field.label} must be a valid ${field.type}`);
  return field.type === 'date' ? String(value).slice(0, 10) : new Date(timestamp).toISOString();
}

function requiredText(value, label, maximum) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum) throw new Error(`${label} is required and must not exceed ${maximum} characters`);
  return text;
}
