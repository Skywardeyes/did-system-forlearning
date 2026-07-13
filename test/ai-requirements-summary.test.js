import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const summaryUrl = new URL('../docs/AI生成需求过程总结.md', import.meta.url);

async function loadSummary() {
  return readFile(summaryUrl, 'utf8');
}

test('AI requirements summary has a defense-oriented narrative structure', async () => {
  const markdown = await loadSummary();
  for (const heading of [
    '项目背景与核心结论',
    '从需求到可验证成果',
    '两个真实纠偏案例',
    '需求到交付的追踪链',
    '实现边界',
    '答辩总结',
  ]) assert.match(markdown, new RegExp(`^## .*${heading}`, 'm'));
});

test('AI requirements summary includes verified project engineering details', async () => {
  const markdown = await loadSummary();
  for (const phrase of [
    '格式完整性', 'Issuer DID 解析', 'DID 当前状态', '密钥版本', 'Ed25519 签名', '有效期', '凭证当前状态',
    'example/example', 'key/key', 'example/key', 'key/example',
    '随机盐', 'SHA-256', '摘要清单',
    '并发写入', '读取—修改—写入',
    'evidence-manifest.json', 'checksums.sha256',
  ]) assert.match(markdown, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('AI requirements summary preserves user authority and teaching boundaries', async () => {
  const markdown = await loadSummary();
  assert.match(markdown, /用户逐项确认/);
  assert.match(markdown, /AI.*(?:辅助|协助)/);
  assert.match(markdown, /本地教学/);
  assert.match(markdown, /不等同于.*(?:正式|生产)/);
  assert.doesNotMatch(markdown, /\b(?:TODO|TBD)\b/);
});
