# Box Model Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure content and controls never visually touch their containing box edges on desktop or mobile.

**Architecture:** Keep full-bleed panel sections, but require each content-bearing child region to own explicit padding. Extend CSS source tests and Chromium computed-style checks before changing styles, then verify the complete application and recorded test suite.

**Tech Stack:** CSS, Node.js 20 `node:test`, Playwright Chromium.

## Global Constraints

- Desktop content regions use 20px horizontal padding.
- Mobile content regions use 12–14px horizontal padding.
- Small interactive controls use at least 6px internal padding.
- Panel headings, tables, and code blocks remain full-bleed.
- No changes to colors, typography, data, routes, or business behavior.
- The final full suite must generate a timestamped local test record.

---

### Task 1: Add failing spacing contract tests

**Files:**
- Modify: `test/ui-layout.test.js`
- Modify: `test/ui/navigation-and-layout.spec.js`

**Interfaces:**
- Consumes: `public/styles.css` and Chromium computed styles.
- Produces: regression contracts for desktop and mobile padding.

- [ ] **Step 1: Add CSS source assertions**

Assert `.list-tools` contains `padding: 12px 20px`, `.pagination` contains horizontal 20px and bottom 16px padding, `.table-action` and `.text-button` have nonzero padding, and the 640px media rule gives `.nav-item` at least 4px horizontal and 6px vertical padding.

- [ ] **Step 2: Add Chromium computed-style assertions**

On desktop, assert the first visible list toolbar has 20px left/right padding and pagination has 20px right padding. At 390×844, assert every visible nav item has at least 4px horizontal and 6px vertical padding and the document has no horizontal overflow.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test test/ui-layout.test.js
npx playwright test test/ui/navigation-and-layout.spec.js
```

Expected: spacing assertions fail against the current zero/2px values.

### Task 2: Apply consistent CSS spacing

**Files:**
- Modify: `public/styles.css`
- Test: `test/ui-layout.test.js`
- Test: `test/ui/navigation-and-layout.spec.js`

**Interfaces:**
- Produces: explicit padding owned by each content-bearing region.

- [ ] **Step 1: Adjust list and pagination regions**

Set:

```css
.list-tools { padding: 12px 20px; margin: 0; }
.pagination { padding: 0 20px 16px; margin-top: 12px; }
```

- [ ] **Step 2: Expand interactive text controls**

Set panel text/table controls to at least `padding: 6px 8px`, while retaining a scoped compact sidebar override. Add a minimum height to pagination buttons without changing colors.

- [ ] **Step 3: Adjust mobile spacing**

In the 640px media rule, set nav button padding to `6px 4px`, list toolbar horizontal padding to 12px, and pagination horizontal padding to 12px. Preserve five equal columns and 62px navigation height.

- [ ] **Step 4: Verify GREEN**

Run the two Task 1 commands.

Expected: source and computed-style spacing tests pass with no horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add public/styles.css test/ui-layout.test.js test/ui/navigation-and-layout.spec.js
git commit -m "fix: enforce consistent box model spacing"
```

### Task 3: Browser review and full recorded verification

**Files:**
- No production files expected.
- Local only: `test-records/<date>/<timestamp>/`

- [ ] **Step 1: Inspect desktop views**

Using the local app, inspect overview, identities, issue, verify, and logs. Confirm toolbars, pagination, action controls, headings, tables, code content, cards, and dialog content all have visible edge separation.

- [ ] **Step 2: Inspect 390×844 layout**

Confirm five navigation controls remain visible and operable, content does not overflow horizontally, and mobile toolbar/pagination padding is at least 12px.

- [ ] **Step 3: Run the full recorded suite**

Run: `npm run test:all`

Expected: Node and Chromium suites pass, exit 0, and a new timestamped record reports 100% pass rate.

- [ ] **Step 4: Final hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: diff check passes; `test-records/` does not appear in Git status.

## Plan Self-Review

- Every confirmed desktop/mobile spacing rule has a source or computed-style test.
- Full-bleed panel structure remains intact.
- The plan changes only CSS and layout tests.
- Final browser inspection and timestamped full test record are required.
