# Local Test Records and Defect Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every full test run locally with timestamped logs and analysis, then use the records to repair the four known defects and prove the final suite passes.

**Architecture:** A pure parsing/report module converts Node TAP and Playwright output into structured statistics and Markdown. A recorded runner streams both test stages to the terminal and local files, always executes both stages, and preserves the aggregate exit code. Existing failing tests drive minimal fixes in crypto, storage, and HTTP response handling.

**Tech Stack:** Node.js 20, `node:test`, child processes, filesystem promises, Playwright 1.61.1, Chromium.

## Global Constraints

- `test-records/` remains local and Git-ignored.
- Every record uses Asia/Shanghai local time and ISO timestamps.
- `npm run test:all` remains the only Agent entry point.
- Node failure never prevents Chromium UI execution.
- Record generation never converts a test failure into success.
- Product changes are limited to the four stable defects already documented.
- The pre-fix record must be retained before product code changes.

---

### Task 1: Pure result parsing and analysis

**Files:**
- Create: `test/helpers/test-records.js`
- Create: `test/unit/test-records.test.js`

**Interfaces:**
- Produces: `formatRunTime(date) -> { iso, local, dateDirectory, runDirectory }`
- Produces: `parseNodeTap(output) -> TestStats`
- Produces: `parsePlaywright(output) -> TestStats`
- Produces: `buildAnalysis({ node, ui, knownFailures, previous }) -> Analysis`
- Produces: `renderMarkdown(metadata) -> string`

- [ ] **Step 1: Write failing parser tests**

Test exact TAP summaries with pass/fail/skipped/todo, Playwright `6 passed` and mixed summaries, missing summaries, failure-name extraction, Asia/Shanghai directory names, known/new failure matching, pass-rate calculation, and Markdown fields.

- [ ] **Step 2: Verify RED**

Run: `node --test test/unit/test-records.test.js`

Expected: FAIL because `test/helpers/test-records.js` does not exist.

- [ ] **Step 3: Implement the pure module**

Use anchored multiline regular expressions for summary lines, never count incidental words in stack traces. Return:

```js
{
  tests: number | null,
  passed: number | null,
  failed: number | null,
  skipped: number | null,
  todo: number | null,
  failureNames: string[],
  parsed: boolean
}
```

`renderMarkdown` must include run time, environment, stage table, failure lists, pass rate, known/new classification, trend, and recommendation.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/unit/test-records.test.js`

Expected: all parser and analysis tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/helpers/test-records.js test/unit/test-records.test.js
git commit -m "test: add test result parsing and analysis"
```

### Task 2: Recorded full-suite runner

**Files:**
- Create: `test/run-recorded-tests.js`
- Create: `test/integration/test-record-runner.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes Task 1 parsing/report functions.
- Produces one run directory with `node.log`, `ui.log`, `metadata.json`, and `result.md`.

- [ ] **Step 1: Write failing runner integration tests**

Run the entry with injectable stage commands in a temporary record root. Assert both stages execute after Node failure, four files exist, timestamps are present, final exit code is nonzero on failure, and two same-second runs do not overwrite each other.

- [ ] **Step 2: Verify RED**

Run: `node --test test/integration/test-record-runner.test.js`

Expected: FAIL because recorded runner does not exist.

- [ ] **Step 3: Implement streaming and recording**

Use `spawn()`, write each stdout/stderr chunk to both the parent stream and stage log, capture the text for parsing, and finalize records in a `finally` path. Read Git metadata with safe read-only commands. Obtain versions without recording environment variables.

- [ ] **Step 4: Wire the command and ignore records**

Set `test:all` to `node test/run-recorded-tests.js`; append `test-records/` to `.gitignore`. Preserve `test:node` and `test:ui`.

- [ ] **Step 5: Verify GREEN**

Run: `node --test test/integration/test-record-runner.test.js`

Expected: all runner tests pass and their temporary records are removed.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore test/run-recorded-tests.js test/integration/test-record-runner.test.js
git commit -m "test: record every full test execution"
```

### Task 3: Generate and inspect the pre-fix record

**Files:**
- Local only: `test-records/<date>/<timestamp>/`

- [ ] **Step 1: Run the recorded suite before fixes**

Run: `npm run test:all`

Expected: exit 1; Node reports 4 failures, UI reports 6 passed, and all four record files exist.

- [ ] **Step 2: Inspect the record**

Confirm `metadata.json` contains branch, commit, timestamps, duration, versions, 106 Node tests with 4 failures, and 6 UI passes. Confirm `result.md` classifies all four failures as known and reports no unclassified failures.

### Task 4: Repair Base58 and storage concurrency

**Files:**
- Modify: `src/crypto.js`
- Modify: `src/store.js`
- Test: `test/unit/crypto.test.js`
- Test: `test/integration/store.test.js`

- [ ] **Step 1: Reconfirm RED**

Run:

```bash
node --test --test-name-pattern="base58 encoding" test/unit/crypto.test.js
node --test --test-name-pattern="concurrent service writes" test/integration/store.test.js
```

Expected: both fail with the documented actual values.

- [ ] **Step 2: Fix Base58 zero handling**

Change the return expression so an all-zero input returns exactly `'1'.repeat(leadingZeroes)`; only append `encoded` when the numeric value produced digits.

- [ ] **Step 3: Serialize store transactions**

Implement `JsonStore.update()` by chaining the full load/mutate/write sequence onto one transaction queue. Avoid calling a separately queued `save()` from inside that transaction to prevent self-deadlock; extract one private atomic write helper shared by `save` and `update`.

- [ ] **Step 4: Verify GREEN**

Run the two commands from Step 1, then `npm run test:unit` and `npm run test:integration`.

Expected: all unit and integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/crypto.js src/store.js
git commit -m "fix: correct Base58 and serialize store updates"
```

### Task 5: Repair HTTP content type and security headers

**Files:**
- Modify: `src/server.js`
- Test: `test/security/protocol-hardening.test.js`
- Test: `test/api/logs-and-errors.test.js`

- [ ] **Step 1: Reconfirm RED**

Run:

```bash
node --test --test-name-pattern="non-JSON content types|baseline security headers" test/security/protocol-hardening.test.js
```

Expected: 415 expectation receives 201; security header expectation receives null.

- [ ] **Step 2: Validate JSON media type**

Before consuming a non-empty request body, accept `application/json` with optional parameters and reject other media types with error code `UNSUPPORTED_MEDIA_TYPE`. Map it to HTTP 415.

- [ ] **Step 3: Apply common security headers**

Set on every response:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Centralize header merging so JSON, static success, static error, and API errors all receive the headers.

- [ ] **Step 4: Verify GREEN**

Run the security command from Step 1, then `npm run test:security`, `npm run test:api`, and `npm run test:ui`.

Expected: all security, API, and UI tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server.js
git commit -m "fix: enforce JSON requests and secure HTTP responses"
```

### Task 6: Final record, comparison, and documentation

**Files:**
- Modify: `docs/测试缺陷报告.md`
- Modify: `docs/测试与人工验收.md`
- Modify: `README.md`
- Local only: second `test-records/<date>/<timestamp>/`

- [ ] **Step 1: Run the post-fix recorded suite**

Run: `npm run test:all`

Expected: exit 0; Node 106/106 and Chromium 6/6 pass; a second timestamped record exists.

- [ ] **Step 2: Validate comparison analysis**

Confirm the new `result.md` reports failure reduction 4 → 0, improved pass rate, four resolved known defects, and zero new failures.

- [ ] **Step 3: Update documentation**

Mark DEF-001 through DEF-004 as fixed with verification commands and final commit references. Document `test-records/` layout, local-only policy, timestamps, record files, and interpretation.

- [ ] **Step 4: Final verification**

Run:

```bash
npm run test:all
git diff --check
git status --short
```

Expected: tests exit 0, a third valid record is generated, diff check passes, and no `test-records/` path appears in Git status.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/测试与人工验收.md docs/测试缺陷报告.md
git commit -m "docs: record resolved defects and test history workflow"
```

## Plan Self-Review

- Tasks 1–2 cover record generation, time, raw logs, JSON, analysis, isolation, and exit semantics.
- Task 3 guarantees a pre-fix evidence record.
- Tasks 4–5 map one-to-one to all four documented failures and use existing RED tests.
- Task 6 guarantees post-fix evidence, comparison analysis, local-only records, and full regression.
- No unrelated production changes are included.
