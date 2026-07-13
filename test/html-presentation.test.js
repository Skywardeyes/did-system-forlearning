import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const presentationUrl = new URL('../outputs/did-vc-test-presentation.html', import.meta.url);

async function loadPresentation() {
  return readFile(presentationUrl, 'utf8');
}

test('HTML presentation is standalone and contains twelve navigable slides', async () => {
  const html = await loadPresentation();
  assert.match(html, /<!doctype html>/i);
  assert.equal((html.match(/<section\b[^>]*class="[^"]*\bslide\b[^"]*"/g) || []).length, 12);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  assert.match(html, /id="progressBar"/);
  assert.match(html, /id="pageCounter"/);
  assert.match(html, /id="fullscreenButton"/);
  assert.match(html, /data-target="slide-12"/);
});

test('HTML presentation reports the exact workbook coverage figures', async () => {
  const html = await loadPresentation();
  for (const expected of ['208', '13', '62', '21', '87', '17', '8']) {
    assert.match(html, new RegExp(`data-count="${expected}"`));
  }
  for (const category of ['接口测试', '单元测试', '集成测试', '功能测试', '兼容性测试', '安全测试']) {
    assert.match(html, new RegExp(category));
  }
});

test('HTML presentation covers verification, evidence, and production boundaries', async () => {
  const html = await loadPresentation();
  assert.ok((html.match(/<details\b/g) || []).length >= 20);
  for (const check of ['格式完整性', 'Issuer DID 解析', 'DID 当前状态', '密钥版本', 'Ed25519 签名', '有效期', '凭证当前状态']) {
    assert.match(html, new RegExp(check));
  }
  for (const boundary of ['cryptosuite', 'KMS/HSM', '压力测试', 'DID Resolver']) {
    assert.match(html, new RegExp(boundary, 'i'));
  }
  assert.match(html, /ArrowDown/);
  assert.match(html, /requestFullscreen/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
});
