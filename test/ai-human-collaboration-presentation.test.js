import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const presentationUrl = new URL('../outputs/ai-human-collaboration-presentation.html', import.meta.url);
const loadPresentation = () => readFile(presentationUrl, 'utf8');

test('AI collaboration presentation is standalone with thirteen navigable slides', async () => {
  const html = await loadPresentation();
  assert.match(html, /<!doctype html>/i);
  assert.equal((html.match(/<section\b[^>]*class="[^"]*\bslide\b[^"]*"/g) || []).length, 13);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  for (const id of ['progressBar', 'pageCounter', 'fullscreenButton', 'menuButton']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-target="slide-13"/);
});

test('presentation covers all ten stages and the approved engineering narrative', async () => {
  const html = await loadPresentation();
  let cursor = -1;
  for (let stage = 1; stage <= 10; stage += 1) {
    const next = html.indexOf(`阶段 ${stage}`);
    assert.ok(next > cursor, `stage ${stage} must appear in order`);
    cursor = next;
  }
  for (const phrase of [
    '人工需求方与评审者', '需求分析 AI', '开发 Agent', '测试 Agent',
    'DID Method 选型纠偏', '日志需求逐步完整化', '测试覆盖由人工反向补全',
    '并发写入缺陷', '真实浏览器验收', '需求到交付的追踪关系',
    '人工不可替代的决策', 'AI 提高分析、实施和验证效率',
  ]) assert.match(html, new RegExp(phrase));
});

test('presentation includes expandable evidence and accessibility safeguards', async () => {
  const html = await loadPresentation();
  assert.ok((html.match(/<details\b/g) || []).length >= 15);
  for (const phrase of ['ArrowDown', 'PageDown', "event.key === 'Home'", "event.key === 'End'", 'location.hash', 'requestFullscreen', 'prefers-reduced-motion', 'focus-visible', 'overflow-wrap:anywhere', '@media print']) assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('presentation script parses and every navigation target resolves', async () => {
  const html = await loadPresentation();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'embedded script must exist');
  assert.doesNotThrow(() => new Function(script));
  const slideIds = new Set([...html.matchAll(/id="(slide-[0-9]+)"/g)].map(match => match[1]));
  const targets = [...html.matchAll(/data-target="(slide-[0-9]+)"/g)].map(match => match[1]);
  assert.equal(slideIds.size, 13);
  assert.ok(targets.length >= 14);
  assert.deepEqual(targets.filter(target => !slideIds.has(target)), []);
});
