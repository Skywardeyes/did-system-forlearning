import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const presentationUrl = new URL('../outputs/ai-requirements-process-presentation.html', import.meta.url);

async function loadPresentation() {
  return readFile(presentationUrl, 'utf8');
}

test('AI requirements presentation is standalone with eleven navigable slides', async () => {
  const html = await loadPresentation();
  assert.match(html, /<!doctype html>/i);
  assert.equal((html.match(/<section\b[^>]*class="[^"]*\bslide\b[^"]*"/g) || []).length, 11);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  assert.match(html, /id="progressBar"/);
  assert.match(html, /id="pageCounter"/);
  assert.match(html, /id="fullscreenButton"/);
  assert.match(html, /data-target="slide-11"/);
});

test('AI requirements presentation faithfully covers the source process', async () => {
  const html = await loadPresentation();
  for (const phrase of [
    '创建 → 正常使用 → 信息更新 → 密钥轮换 → 停用',
    'active ↔ suspended',
    'did:example',
    'did:key',
    '0、1、10、11、20、21、50、51',
    '分层测试矩阵',
    '端到端主流程',
    '5,000',
    '编写失败测试',
    '1440、1280、1024、768、390',
  ]) assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('AI requirements presentation includes expandable evidence and accessibility safeguards', async () => {
  const html = await loadPresentation();
  assert.ok((html.match(/<details\b/g) || []).length >= 18);
  assert.match(html, /用户逐项确认/);
  assert.match(html, /产品需求说明书-DID-VC生命周期\.md/);
  assert.match(html, /ArrowDown/);
  assert.match(html, /requestFullscreen/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.match(html, /focus-visible/);
});

test('AI requirements presentation script parses and every navigation target resolves', async () => {
  const html = await loadPresentation();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'embedded script must exist');
  assert.doesNotThrow(() => new Function(script));
  const slideIds = new Set([...html.matchAll(/id="(slide-[0-9]+)"/g)].map(match => match[1]));
  const targets = [...html.matchAll(/data-target="(slide-[0-9]+)"/g)].map(match => match[1]);
  assert.equal(slideIds.size, 11);
  assert.ok(targets.length >= 12);
  assert.deepEqual(targets.filter(target => !slideIds.has(target)), []);
});
