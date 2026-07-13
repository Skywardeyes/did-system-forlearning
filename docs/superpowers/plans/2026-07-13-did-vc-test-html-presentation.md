# DID/VC Test HTML Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, presentation-ready HTML deck that explains the 208-case DID/VC high-coverage test suite with full-screen vertical slides and expandable evidence panels.

**Architecture:** Create one standalone HTML file containing semantic slide markup, embedded CSS, and dependency-free JavaScript. The document reads no remote assets, uses native `details/summary` for expandable evidence, and controls slide navigation through scroll snapping, keyboard handlers, an intersection observer, and a compact navigation rail.

**Tech Stack:** HTML5, CSS3, browser-native JavaScript, Node.js static verification scripts.

## Global Constraints

- Deliver a single HTML file that opens directly without network access.
- Include 12 full-screen sections matching the approved design specification.
- Support mouse wheel, keyboard, side navigation, progress display, and fullscreen controls.
- Use native keyboard-accessible expandable panels.
- Use the workbook figures: 208 total; API 13, unit 62, integration 21, functional 87, compatibility 17, security 8.
- Clearly separate tested scope from production-grade capabilities not tested.
- Prevent uncontrolled horizontal page overflow at desktop and mobile widths.

---

### Task 1: Build the standalone presentation

**Files:**
- Create: `outputs/did-vc-test-presentation.html`
- Test: `test/html-presentation.test.js`

**Interfaces:**
- Consumes: approved design in `docs/superpowers/specs/2026-07-13-did-vc-test-html-presentation-design.md`
- Produces: a standalone document with 12 `.slide` sections, navigation buttons using `data-target`, expandable `details` blocks, `#progressBar`, `#pageCounter`, and `#fullscreenButton`.

- [ ] **Step 1: Write structural tests**

Create a Node test that reads `outputs/did-vc-test-presentation.html` and asserts: one HTML document, no remote `http(s)` resources, exactly 12 slide sections, six correct category counts, at least 20 expandable panels, navigation/progress/fullscreen controls, all seven VC verification names, and production-boundary copy.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test test/html-presentation.test.js`

Expected: FAIL because `outputs/did-vc-test-presentation.html` does not yet exist.

- [ ] **Step 3: Implement the complete HTML deck**

Create the single file with:

- a fixed navigation rail and mobile progress header;
- 12 semantic full-screen sections;
- exact workbook statistics and coverage explanations;
- expandable normal/boundary/evidence cards for every major test domain;
- CSS variables for the deep-blue, cyan, green, amber, and red semantic palette;
- responsive card grids and safe text wrapping;
- reduced-motion behavior;
- keyboard navigation for ArrowUp, ArrowDown, PageUp, PageDown, Home, and End;
- an intersection observer that updates navigation state, page count, and progress;
- fullscreen entry/exit using the browser Fullscreen API.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node --test test/html-presentation.test.js`

Expected: PASS with all presentation structure and content assertions satisfied.

- [ ] **Step 5: Commit the presentation and focused test**

```bash
git add outputs/did-vc-test-presentation.html test/html-presentation.test.js
git commit -m "feat: add DID VC test HTML presentation"
```

### Task 2: Verify integration and presentation safety

**Files:**
- Verify: `outputs/did-vc-test-presentation.html`
- Verify: `test/html-presentation.test.js`

**Interfaces:**
- Consumes: standalone presentation from Task 1.
- Produces: verification evidence that the deck is structurally complete and does not regress the existing Node test suite.

- [ ] **Step 1: Run HTML syntax and embedded-script parsing checks**

Use a Node verification command to extract the embedded script and compile it with `new Function(scriptText)`. Confirm the document has balanced slide IDs and navigation targets.

- [ ] **Step 2: Run the presentation test**

Run: `node --test test/html-presentation.test.js`

Expected: all assertions pass.

- [ ] **Step 3: Run the existing Node test suite**

Run: `npm test`

Expected: the existing Node suite and the new presentation test pass with zero failures.

- [ ] **Step 4: Perform responsive static checks**

Confirm the stylesheet contains desktop and mobile breakpoints, `overflow-wrap`, responsive card columns, scrollable expanded slide content, `prefers-reduced-motion`, and no fixed content width wider than the viewport.

- [ ] **Step 5: Commit any verification fixes**

If verification required changes, stage only `outputs/did-vc-test-presentation.html` and `test/html-presentation.test.js`, then commit:

```bash
git commit -m "fix: harden HTML presentation interactions"
```
