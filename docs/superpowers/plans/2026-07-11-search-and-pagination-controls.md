# Search and Pagination Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify explicit fuzzy-search controls and same-row page-size pagination controls across DID, VC, verification-record, and structured-log lists.

**Architecture:** Keep list query state in the existing `list-ui.js` and `log-ui.js` helpers, while moving reusable pagination markup into `renderPagination`. Static HTML owns labeled search controls; `app.js` binds submit, Enter, clear, page-size, and navigation actions. CSS supplies fixed target widths and responsive wrapping without changing backend APIs.

**Tech Stack:** HTML, CSS, browser ES modules, Node.js test runner, Playwright Chromium

## Global Constraints

- Search placeholder text is exactly `支持模糊搜索`.
- Search executes only from the `搜索` button or Enter; typing alone does not request data.
- Clearing `×` immediately removes the search condition and returns to page 1.
- Search buttons target 70px width; page-size selects target 80px width.
- Pagination row contains `每页展示`, page-size select, page summary, previous, and next controls.
- Page-size options remain 10, 20, and 50.
- Mobile layouts may wrap but must not cause horizontal overflow.
- Backend APIs and fuzzy-match algorithms remain unchanged.

---

### Task 1: Reusable pagination markup

**Files:**
- Modify: `public/list-ui.js`
- Test: `test/unit/ui-helpers.test.js`
- Test: `test/list-ui.test.js`

**Interfaces:**
- Consumes: `renderPagination({ page, totalPages, total }, { id, pageSize })`
- Produces: pagination markup with `${id}-page-size`, selected option, page summary, and navigation buttons.

- [ ] **Step 1: Write failing renderer tests**

Add assertions equivalent to:

```js
const html = renderPagination(
  { page: 2, totalPages: 3, total: 25 },
  { id: 'did', pageSize: 20 },
);
assert.match(html, /每页展示/);
assert.match(html, /id="did-page-size"/);
assert.match(html, /<option value="20" selected>20<\/option>/);
assert.match(html, /共 25 条 · 2\/3 页/);
assert.doesNotMatch(html, /data-page="prev" disabled/);
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test test/unit/ui-helpers.test.js test/list-ui.test.js`

Expected: FAIL because the existing renderer has no label, ID, or page-size options.

- [ ] **Step 3: Implement the renderer contract**

Change the renderer to generate the following structure and derive the selected option from `pageSize`:

```js
export function renderPagination({ page, totalPages, total }, { id, pageSize }) {
  const options = [10, 20, 50]
    .map((size) => `<option value="${size}"${size === Number(pageSize) ? ' selected' : ''}>${size}</option>`)
    .join('');
  return `<div class="pagination"><label class="page-size-label" for="${id}-page-size">每页展示</label><select id="${id}-page-size" class="page-size-select">${options}</select><span class="page-summary">共 ${total} 条 · ${page}/${totalPages} 页</span><button data-page="prev"${page <= 1 ? ' disabled' : ''}>上一页</button><button data-page="next"${page >= totalPages ? ' disabled' : ''}>下一页</button></div>`;
}
```

- [ ] **Step 4: Run renderer and state tests**

Run: `node --test test/unit/ui-helpers.test.js test/list-ui.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/list-ui.js test/unit/ui-helpers.test.js test/list-ui.test.js
git commit -m "feat: render page size within pagination"
```

### Task 2: Accessible search HTML for all lists

**Files:**
- Modify: `public/index.html`
- Test: `test/ui-layout.test.js`

**Interfaces:**
- Consumes: list IDs `did`, `vc`, `log`, and `structured-log`.
- Produces: `${id}-search`, `${id}-search-clear`, `${id}-search-submit`; removes all static `${id}-page-size` selects.

- [ ] **Step 1: Write failing source-structure tests**

Read `public/index.html` and assert each of the four prefixes has a search label, `placeholder="支持模糊搜索"`, clear button with `aria-label="清除搜索内容"`, and submit button text `搜索`. Assert `structured-log-page-size` is absent from the static filter markup.

- [ ] **Step 2: Verify the source tests fail**

Run: `node --test test/ui-layout.test.js`

Expected: FAIL because labels, clear buttons, and submit buttons do not exist.

- [ ] **Step 3: Replace ordinary list toolbars**

For `did`, `vc`, and `log`, use this exact ID pattern:

```html
<div class="list-tools search-tools">
  <label for="did-search">搜索</label>
  <div class="search-input-wrap">
    <input id="did-search" placeholder="支持模糊搜索" />
    <button id="did-search-clear" class="search-clear" type="button" aria-label="清除搜索内容" hidden>×</button>
  </div>
  <button id="did-search-submit" class="button secondary search-submit" type="button">搜索</button>
</div>
```

Repeat with the corresponding prefix while retaining only one occurrence of each ID.

- [ ] **Step 4: Update structured-log filters**

Place the same labeled search group at the start of `.log-filters`, retain type/result/level/module/start/end controls, and remove the static `structured-log-page-size` select because pagination now renders it.

- [ ] **Step 5: Run source tests and commit**

Run: `node --test test/ui-layout.test.js`

Expected: PASS.

```powershell
git add public/index.html test/ui-layout.test.js
git commit -m "feat: add labeled explicit search controls"
```

### Task 3: Search, clear, and dynamic pagination behavior

**Files:**
- Modify: `public/app.js`
- Test: `test/unit/ui-helpers.test.js`
- Test: `test/ui/navigation-and-layout.spec.js`

**Interfaces:**
- Consumes: IDs from Task 2 and `renderPagination(meta, { id, pageSize })` from Task 1.
- Produces: `bindSearchControls(prefix, submit)` and pagination bindings that survive re-rendering.

- [ ] **Step 1: Add failing browser interaction tests**

For the DID list, assert that typing does not immediately filter, clicking `#did-search-submit` filters, Enter filters, `#did-search-clear` becomes visible with text and clears the filter, and selecting `20` from `#did-page-size` leaves the page summary on page 1. Add equivalent visibility/label checks for structured logs.

- [ ] **Step 2: Verify browser tests fail**

Run: `npx playwright test test/ui/navigation-and-layout.spec.js --project=chromium`

Expected: FAIL because the new controls have no behavior and pagination uses the old renderer call.

- [ ] **Step 3: Pass list identity and page size into pagination rendering**

Use:

```js
renderPagination(listMeta.did, { id: 'did', pageSize: listStates.did.pageSize });
renderPagination(listMeta.vc, { id: 'vc', pageSize: listStates.vc.pageSize });
renderPagination(listMeta.log, { id: 'log', pageSize: listStates.log.pageSize });
renderPagination(structuredLogMeta, { id: 'structured-log', pageSize: structuredLogFilters.pageSize });
```

- [ ] **Step 4: Bind dynamic pagination controls**

Extend `bindPagination(type)` to bind `${type}-page-size` after each render. In `renderStructuredLogs`, bind previous, next, and `#structured-log-page-size` to `changeStructuredLogs`.

- [ ] **Step 5: Implement explicit search binding**

Add a helper with this behavior:

```js
function bindSearchControls(prefix, submit) {
  const input = $(`#${prefix}-search`);
  const clear = $(`#${prefix}-search-clear`);
  const syncClear = () => { clear.hidden = input.value.length === 0; };
  input.addEventListener('input', syncClear);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(input.value); }
  });
  $(`#${prefix}-search-submit`).addEventListener('click', () => submit(input.value));
  clear.addEventListener('click', () => {
    input.value = '';
    syncClear();
    input.focus();
    submit('');
  });
  syncClear();
}
```

Bind ordinary prefixes through `changeList(type, { type: 'search', value })` and structured logs through `changeStructuredLogs({ type: 'search', value })`. Remove the old search `change` listeners and remove `structured-log-search`/`structured-log-page-size` from the generic advanced-filter loop.

- [ ] **Step 6: Run behavior tests and commit**

Run: `node --test test/unit/ui-helpers.test.js && npx playwright test test/ui/navigation-and-layout.spec.js --project=chromium`

Expected: all selected tests PASS.

```powershell
git add public/app.js test/unit/ui-helpers.test.js test/ui/navigation-and-layout.spec.js
git commit -m "feat: implement explicit search and clear behavior"
```

### Task 4: Desktop and mobile layout

**Files:**
- Modify: `public/styles.css`
- Test: `test/ui-layout.test.js`
- Test: `test/ui/navigation-and-layout.spec.js`

**Interfaces:**
- Consumes: `.search-tools`, `.search-input-wrap`, `.search-clear`, `.search-submit`, `.page-size-label`, `.page-size-select`, `.page-summary`.
- Produces: stable target widths and wrap-safe responsive layout.

- [ ] **Step 1: Add failing CSS and computed-layout tests**

Assert CSS declares `width: 70px` for `.search-submit`, `width: 80px` for `.page-size-select`, and positioned clear-button styles. In Chromium at desktop width, assert label/input/search are aligned on one row and pagination elements share one row; at 390px assert document width does not overflow.

- [ ] **Step 2: Verify layout tests fail**

Run: `node --test test/ui-layout.test.js && npx playwright test test/ui/navigation-and-layout.spec.js --project=chromium`

Expected: FAIL on missing width and alignment rules.

- [ ] **Step 3: Implement desktop styles**

Add styles equivalent to:

```css
.search-tools { align-items: center; flex-wrap: wrap; }
.search-tools > label, .page-size-label { flex: 0 0 auto; }
.search-input-wrap { position: relative; flex: 1 1 220px; min-width: 0; }
.search-input-wrap input { width: 100%; padding-right: 36px; }
.search-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); }
.search-submit { flex: 0 0 70px; width: 70px; }
.pagination { flex-wrap: wrap; }
.page-size-select { flex: 0 0 80px; width: 80px; }
.page-summary { margin-left: auto; }
```

Preserve existing panel padding and button spacing rules.

- [ ] **Step 4: Implement mobile wrapping**

Within the existing `max-width: 640px` media query, let `.page-summary` start a new flexible group when necessary and ensure every child has `min-width: 0`; do not introduce fixed aggregate widths wider than the viewport.

- [ ] **Step 5: Run layout tests and commit**

Run: `node --test test/ui-layout.test.js && npx playwright test test/ui/navigation-and-layout.spec.js --project=chromium`

Expected: PASS at desktop and mobile sizes.

```powershell
git add public/styles.css test/ui-layout.test.js test/ui/navigation-and-layout.spec.js
git commit -m "style: align search and pagination controls"
```

### Task 5: Full regression and recorded result

**Files:**
- Verify: all application and test files
- Generate (gitignored): `test-records/YYYY-MM-DD/<timestamp>/result.md`

**Interfaces:**
- Consumes: complete application.
- Produces: timestamped test evidence and a clean Git worktree.

- [ ] **Step 1: Run source and whitespace validation**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete recorded suite**

Run: `npm run test:all`

Expected: all Node and Chromium tests pass, command exits 0, and output prints a new `测试记录：...` path.

- [ ] **Step 3: Review the generated analysis**

Open the new `result.md` and verify it contains the Asia/Shanghai execution time, stage totals, overall pass rate, and a short failure/regression analysis with no secrets.

- [ ] **Step 4: Confirm repository state**

Run: `git status --short`

Expected: no tracked changes; timestamped records remain intentionally ignored.

