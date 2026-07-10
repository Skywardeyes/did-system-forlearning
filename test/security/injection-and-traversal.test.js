import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDidCard } from '../../public/did-ui.js';
import { startTestApp } from '../helpers/fixture.js';

const payload = '<img src=x onerror="globalThis.polluted=true">';

test('stored XSS remains inert when rendered by UI helpers', async (t) => {
  const app = await startTestApp(t);
  const response = await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: payload, role: 'issuer' }) });
  const did = await response.json();
  const escapeHtml = (value) => String(value).replace(/[&<>\'\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const html = renderDidCard(did, { escapeHtml, formatDate: (value) => value });
  assert.doesNotMatch(html, /<img|onerror="/);
  assert.match(html, /&lt;img/);
});

test('prototype pollution payload does not mutate global object behavior', async (t) => {
  const app = await startTestApp(t);
  const body = '{"name":"Safe","role":"issuer","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
  assert.equal(({}).polluted, undefined);
  assert.equal((await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 201);
  assert.equal(({}).polluted, undefined);
});

test('encoded traversal requests cannot read repository files', async (t) => {
  const app = await startTestApp(t);
  for (const route of ['/..%2Fpackage.json', '/%2e%2e%2fpackage.json', '/..%252fpackage.json', '/%2e%2e/package.json']) {
    const response = await fetch(`${app.url}${route}`);
    const text = await response.text();
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(text, /did-vc-learning-lab|"scripts"/);
  }
});
