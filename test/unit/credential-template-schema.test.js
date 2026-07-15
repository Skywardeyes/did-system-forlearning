import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeClaims, normalizeTemplateSchema } from '../../src/credential-template-schema.js';

test('credential template schema preserves explicit enum options and validates claims', () => {
  const schema = normalizeTemplateSchema({ name: '学历证明', credentialType: 'DegreeCredential', fields: [
    { key: 'degreeLevel', label: '学历层次', type: 'enum', required: true, options: ['本科', '硕士'] },
  ] });
  assert.deepEqual(schema.fields[0].options, ['本科', '硕士']);
  assert.deepEqual(normalizeClaims(schema, { degreeLevel: '硕士' }), { degreeLevel: '硕士' });
  assert.throws(() => normalizeClaims(schema, { degreeLevel: '博士' }), /not an allowed option/);
});

test('credential template schema rejects an enum without options', () => {
  assert.throws(() => normalizeTemplateSchema({ name: '错误模板', credentialType: 'InvalidEnumCredential', fields: [
    { key: 'level', label: '等级', type: 'enum', required: true, options: [] },
  ] }), /must define between 1 and 50 options/);
});
