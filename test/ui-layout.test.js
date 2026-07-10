import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('隐藏的分段单选框不继承全宽输入框尺寸', () => {
  const rule = css.match(/\.segmented input\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /width:\s*1px/);
  assert.match(rule, /height:\s*1px/);
  assert.match(rule, /margin:\s*0/);
});

test('日志筛选网格允许列收缩而不撑破面板', () => {
  const rule = css.match(/\.log-filters\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /minmax\(0,\s*2fr\)/);
  assert.match(rule, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test('窄屏导航为五个功能入口预留等宽列', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*nav\s*\{\s*grid-template-columns:\s*repeat\(5,\s*1fr\)/);
});
