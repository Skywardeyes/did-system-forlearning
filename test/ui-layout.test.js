import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('all list searches have labels, fuzzy-search hints, clear controls and submit buttons', () => {
  for (const id of ['did', 'vc', 'log', 'structured-log']) {
    assert.match(html, new RegExp(`<label[^>]+for="${id}-search"[^>]*>搜索</label>`));
    assert.match(html, new RegExp(`id="${id}-search"[^>]+placeholder="支持模糊搜索"`));
    assert.match(html, new RegExp(`id="${id}-search-clear"[^>]+aria-label="清除搜索内容"`));
    assert.match(html, new RegExp(`id="${id}-search-submit"[^>]*>搜索</button>`));
  }
  assert.doesNotMatch(html, /<select id="structured-log-page-size"/);
});

test('search and page-size controls use the requested target widths', () => {
  const searchButton = css.match(/\.search-submit\s*\{([^}]*)\}/)?.[1] || '';
  const pageSize = css.match(/\.page-size-select\s*\{([^}]*)\}/)?.[1] || '';
  const clear = css.match(/\.search-clear\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(searchButton, /width:\s*70px/);
  assert.match(pageSize, /width:\s*80px/);
  assert.match(clear, /position:\s*absolute/);
});

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

test('列表工具栏和分页栏与面板边缘保持统一留白', () => {
  const tools = css.match(/\.list-tools\s*\{([^}]*)\}/)?.[1] || '';
  const pagination = css.match(/\.pagination\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(tools, /padding:\s*12px\s+20px/);
  assert.match(pagination, /padding:\s*0\s+20px\s+16px/);
});

test('文字操作按钮具有非零点击内边距', () => {
  const textButton = css.match(/\.text-button\s*\{([^}]*)\}/)?.[1] || '';
  const sidebarTextButton = css.match(/\.sidebar \.text-button\s*\{([^}]*)\}/)?.[1] || '';
  const tableAction = css.match(/\.table-action\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(textButton, /padding:\s*6px\s+8px/);
  assert.match(sidebarTextButton, /padding:\s*6px\s+8px/);
  assert.match(tableAction, /padding:\s*6px\s+8px/);
});

test('窄屏导航按钮保留至少四像素水平留白', () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.nav-item,\s*\.nav-item\.active\s*\{[^}]*padding:\s*6px\s+4px/);
});
