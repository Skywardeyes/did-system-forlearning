# AI Requirements Process HTML Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone 11-section HTML presentation explaining how AI-assisted dialogue, analysis, user confirmation, specification, TDD, and browser validation produced the DID/VC project requirements.

**Architecture:** Use one dependency-free HTML document containing semantic slide markup, embedded responsive CSS, and browser-native JavaScript. Reuse the established vertical presentation interaction model while giving this deck a distinct process-timeline visual language and source-faithful content from `docs/AI生成需求过程总结.md`.

**Tech Stack:** HTML5, CSS3, browser-native JavaScript, Node.js structural tests.

## Global Constraints

- Deliver one offline HTML file with no remote resources.
- Include exactly 11 full-screen sections and matching navigation targets.
- Support scroll, keyboard, side navigation, progress, and fullscreen controls.
- Include at least 18 native `details/summary` evidence panels.
- Cover lifecycle rules, DID Method selection, list rules, test strategy, logging evolution, TDD, UI feedback, document outputs, and the final closed loop.
- Preserve the source document's distinction between AI assistance and user-confirmed business decisions.
- Prevent uncontrolled horizontal overflow on desktop and mobile widths.

---

### Task 1: Create the presentation through a test-first cycle

**Files:**
- Create: `outputs/ai-requirements-process-presentation.html`
- Create: `test/ai-requirements-presentation.test.js`

**Interfaces:**
- Consumes: `docs/AI生成需求过程总结.md` and the approved design specification.
- Produces: one document with 11 `.slide` sections, `data-target` navigation, `#progressBar`, `#pageCounter`, `#fullscreenButton`, and at least 18 expandable panels.

- [ ] **Step 1: Write structural and content tests**

Create Node tests asserting the output exists, is standalone, has exactly 11 slides, contains all navigation and control elements, includes at least 18 details panels, and contains the core source phrases and process stages.

- [ ] **Step 2: Run the test and observe the expected missing-file failure**

Run: `node --test test/ai-requirements-presentation.test.js`

Expected: FAIL with ENOENT for `outputs/ai-requirements-process-presentation.html`.

- [ ] **Step 3: Implement the standalone deck**

Build all 11 approved sections with exact source content, responsive grids, process timelines, decision cards, native expandable evidence, reduced-motion behavior, keyboard navigation, intersection-based progress, and fullscreen controls.

- [ ] **Step 4: Run the focused test**

Run: `node --test test/ai-requirements-presentation.test.js`

Expected: all presentation assertions pass.

- [ ] **Step 5: Commit the deliverable and test**

```bash
git add outputs/ai-requirements-process-presentation.html test/ai-requirements-presentation.test.js docs/superpowers/plans/2026-07-13-ai-requirements-html-presentation.md
git commit -m "feat: add AI requirements process HTML presentation"
```

### Task 2: Verify syntax and project integration

**Files:**
- Verify: `outputs/ai-requirements-process-presentation.html`
- Verify: `test/ai-requirements-presentation.test.js`

**Interfaces:**
- Consumes: the completed standalone deck.
- Produces: fresh verification evidence for HTML structure, embedded JavaScript, navigation integrity, and the project Node suite.

- [ ] **Step 1: Parse the embedded JavaScript**

Extract the script from the HTML and compile it with `new Function(scriptText)`. Assert that every `data-target` resolves to a slide ID.

- [ ] **Step 2: Run the focused test again**

Run: `node --test test/ai-requirements-presentation.test.js`

Expected: all tests pass.

- [ ] **Step 3: Run the designated project Node suite**

Run: `npm run test:node`

Expected: zero failures, including both HTML presentation test files.

- [ ] **Step 4: Check responsive and accessibility safeguards**

Confirm the document includes mobile breakpoints, `overflow-wrap: anywhere`, native details controls, keyboard navigation, focus-visible states, and `prefers-reduced-motion` handling.
