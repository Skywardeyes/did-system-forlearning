import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const documentUrl = new URL('../docs/AI与人工协作过程说明.md', import.meta.url);

async function loadDocument() {
  return readFile(documentUrl, 'utf8');
}

test('AI human collaboration document contains all ten stages in order', async () => {
  const markdown = await loadDocument();
  let previous = -1;
  for (let stage = 1; stage <= 10; stage += 1) {
    const position = markdown.search(new RegExp(`^## ${stage}\\.`, 'm'));
    assert.ok(position > previous, `stage ${stage} must exist after stage ${stage - 1}`);
    previous = position;
  }
});

test('each collaboration stage defines responsibilities, outputs, gates, and rollback', async () => {
  const markdown = await loadDocument();
  for (const label of ['阶段目标', '输入材料', 'AI/Agent 工作', '人工工作', '主要输出', '人工确认点', '不通过时的回退']) {
    assert.ok((markdown.match(new RegExp(`\\*\\*${label}：\\*\\*`, 'g')) || []).length >= 10, `${label} must appear for every stage`);
  }
});

test('document includes roles, agent independence, traceability, flow, cases, and boundaries', async () => {
  const markdown = await loadDocument();
  for (const phrase of [
    '需求分析 AI', '开发 Agent', '测试 Agent', '人工需求方与评审者',
    '```mermaid', '需求到交付的追踪关系', '并行协作',
    'did:example', 'did:key', '七项完整验证', 'correlationId',
    '并发写入', '真实浏览器', '人工不可替代', '最终验收', '答辩总结',
  ]) assert.match(markdown, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(markdown, /\b(?:TODO|TBD)\b/);
});
