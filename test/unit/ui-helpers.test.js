import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDidCreation, renderDidCard } from '../../public/did-ui.js';
import { applyListAction, createListState, renderPagination } from '../../public/list-ui.js';
import { applyLogFilter, createLogFilters, renderLogLevel, renderLogRow } from '../../public/log-ui.js';

test('DID creation runs API, reset, refresh and notification in order', async () => {
  const calls = [];
  const form = { reset() { calls.push('reset'); } };
  const created = await completeDidCreation({
    form,
    body: { name: 'Issuer', role: 'issuer' },
    api: async () => { calls.push('api'); return { did: 'did:example:123' }; },
    refresh: async () => { calls.push('refresh'); },
    notify: (message) => calls.push(message),
  });
  assert.equal(created.did, 'did:example:123');
  assert.deepEqual(calls.slice(0, 3), ['api', 'reset', 'refresh']);
  assert.match(calls[3], /did:example:123/);
});

test('DID card escapes fields and gates lifecycle buttons by capability', () => {
  const escapeHtml = (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const base = { id: '1', did: 'did:example:1', method: 'example', status: 'active', version: 1, role: 'issuer', name: '<img>', publicJwk: { x: '<x>' }, createdAt: 'now' };
  const enabled = renderDidCard({ ...base, capabilities: { update: true } }, { escapeHtml, formatDate: (value) => value });
  assert.doesNotMatch(enabled, /<img>/);
  assert.match(enabled, /data-update-did/);
  const disabled = renderDidCard({ ...base, capabilities: { update: false } }, { escapeHtml, formatDate: (value) => value });
  assert.doesNotMatch(disabled, /data-update-did/);
});

test('list and log filter changes reset paging and disable boundary controls', () => {
  assert.deepEqual(applyListAction(createListState(), { type: 'search', value: 'did' }), { search: 'did', page: 1, pageSize: 10 });
  assert.equal(applyListAction({ search: '', page: 3, pageSize: 10 }, { type: 'pageSize', value: '20' }).page, 1);
  assert.match(renderPagination({ page: 1, totalPages: 2, total: 11 }), /data-page="prev" disabled/);
  assert.equal(applyLogFilter({ ...createLogFilters(), page: 4 }, { type: 'level', value: 'warn' }).page, 1);
});

test('log level and row rendering safely handle unknown and user text', () => {
  assert.match(renderLogLevel('error'), /log-level error">ERROR/);
  assert.match(renderLogLevel('<script>'), /log-level unknown">UNKNOWN/);
  const html = renderLogRow({ id: 'x" onclick="alert(1)', occurredAt: '<time>', level: 'info', type: '<type>', action: '<action>', module: '<module>', success: false, targetName: '<img>', message: '<script>alert(1)<\/script>' });
  assert.doesNotMatch(html, /<script>|<img>|data-log-detail="x" onclick=/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /x&quot; onclick=&quot;alert\(1\)/);
});
